import "server-only";
import { createTradingClient } from "@/lib/supabase/trading";
import { lageFesthalten } from "@/lib/trading/lage-festhalten";
import { verschicke } from "./versand";
import type { AlarmEinstellungen } from "./regeln";

type Db = NonNullable<ReturnType<typeof createTradingClient>>;

/**
 * Neue GVA-Hits aus dem Screener als Push melden (seit 22.09.2026).
 *
 * Bisher meldete der Cron nur selbst gezeichnete Linien. Ein Hit, den der
 * Screener fand, stand still im Cockpit, bis Kerim zufällig reinschaute.
 *
 * Regeln:
 * - Nur Signale mit Status „new" und einem Treffer in den letzten 24 h. Ohne
 *   diese Grenze würde der erste Lauf nach der Migration jeden alten, nie
 *   beantworteten Hit auf einmal schicken.
 * - Einmal je Signal — endgültig. `signal_meldungen` hält fest, was raus ist;
 *   der Platz wird belegt, BEVOR gesendet wird, damit zwei überlappende Läufe
 *   nicht doppelt melden. Fehlt die Tabelle, wird gar nichts gesendet.
 * - Steht das Paar mit diesem Level schon in den aktiven Trades, meldet sich
 *   dort bereits der Linien-Alarm. Ein zweiter Push wäre derselbe Inhalt.
 * - Es gilt die Art „hit" aus den Alarm-Einstellungen: Paarfilter, Ruhezeit
 *   (Treffer dürfen standardmässig durch), Tagesgrenze, stumm.
 */
export async function meldeNeueHits(
  db: Db, einst: AlarmEinstellungen,
  lage: { jetztMinuten: number; heute: string; bereitsGesendet: number },
): Promise<{ gesendet: number; berichte: string[]; hinweis: string | null }> {
  const berichte: string[] = [];
  const seit = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: signale } = await db.from("signals")
    .select("id, pair, line_type, line_level, hit_at")
    .eq("status", "new").gte("hit_at", seit)
    .order("hit_at", { ascending: true }).limit(30);
  const liste = (signale ?? []) as {
    id: string; pair: string; line_type: string | null; line_level: number | null;
  }[];
  if (liste.length === 0) return { gesendet: 0, berichte, hinweis: null };

  // Tabelle da? Ein einziger Test statt einer Fehlermeldung je Signal.
  const probe = await db.from("signal_meldungen").select("signal_id").limit(1);
  if (probe.error) {
    return {
      gesendet: 0, berichte,
      hinweis: "signal_meldungen fehlt — supabase/trading/05_journal_und_hit_meldung.sql "
        + "ausführen, erst dann gehen Hit-Pushes raus.",
    };
  }

  const ids = liste.map((s) => String(s.id));
  const [{ data: schon }, { data: aktive }] = await Promise.all([
    db.from("signal_meldungen").select("signal_id").in("signal_id", ids),
    db.from("trading_watchlist").select("pair, line_level").eq("archived", false),
  ]);
  const gemeldet = new Set(((schon ?? []) as { signal_id: string }[]).map((r) => r.signal_id));
  const sauber = (p: string) => p.replace(/[^A-Za-z]/g, "").toUpperCase();
  const inListe = (pair: string, level: number | null) => level !== null
    && ((aktive ?? []) as { pair: string; line_level: number | null }[]).some((w) =>
      sauber(w.pair) === sauber(pair) && w.line_level !== null
      && Math.abs(Number(w.line_level) - level) < Math.max(1e-6, Math.abs(level) * 1e-5));

  let gesendet = 0;
  let platz = lage.bereitsGesendet;

  for (const s of liste) {
    const id = String(s.id);
    if (gemeldet.has(id)) continue;
    const pair = sauber(s.pair);
    const level = s.line_level === null ? null : Number(s.line_level);
    if (inListe(pair, level)) continue;

    // Erst belegen, dann senden. Scheitert der Insert, war ein paralleler
    // Lauf schneller.
    const { error } = await db.from("signal_meldungen").insert({ signal_id: id });
    if (error) continue;

    const lang = s.line_type !== "short";
    const nachkomma = pair.includes("JPY") ? 3 : 5;
    const ergebnis = await verschicke({
      art: "hit",
      pair,
      titel: `Neuer GVA-Hit: ${pair} ${lang ? "Long" : "Short"}`,
      text: level !== null
        ? `Linie ${level.toFixed(nachkomma)} getroffen — im Cockpit entscheiden: aktiv nehmen oder verwerfen.`
        : "Linie getroffen — im Cockpit entscheiden: aktiv nehmen oder verwerfen.",
      url: `/trading/cockpit?paar=${pair}`,
      tag: `signal-${id}`,
      wichtig: true,
    }, einst, { jetztMinuten: lage.jetztMinuten, heute: lage.heute, bereitsGesendet: platz });

    platz++;
    if (ergebnis.push.gesendet > 0 || ergebnis.telegram.ok) gesendet++;
    berichte.push(ergebnis.zeile);
  }

  return { gesendet, berichte, hinweis: null };
}

/**
 * Fundamentallage für frisch importierte Live-Trades einfrieren.
 *
 * Die Brücke legt einen Trade beim Eröffnen an; der nächste Cron-Lauf (≤ 5 min)
 * hält die Lage fest. Näher an den Einstieg kommt man ohne Eingriff in die
 * Brücke nicht. Nur Trades der letzten zwei Tage — ältere würden die Lage von
 * heute bekommen und damit genau das vortäuschen, was der Snapshot vermeiden
 * soll. Höchstens einer pro Lauf: die COT-Abfrage ist schwer.
 */
export async function lageFuerNeueTrades(db: Db): Promise<string | null> {
  const seit = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.from("trades")
    .select("id, symbol, side")
    .eq("session_type", "live").is("fundamental_snapshot", null)
    .gte("created_at", seit)
    .order("created_at", { ascending: false }).limit(1);
  if (error) return null; // Spalte fehlt noch — still überspringen.

  const t = ((data ?? []) as { id: string; symbol: string; side: string | null }[])[0];
  if (!t) return null;
  const fehler = await lageFesthalten(
    t.id, t.symbol, t.side === "short" ? "short" : "long", "auto");
  return fehler ? `Lage ${t.symbol}: ${fehler}` : `Lage ${t.symbol} festgehalten`;
}
