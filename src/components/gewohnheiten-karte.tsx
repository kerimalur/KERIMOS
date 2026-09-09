import Link from "next/link";
import { ladeGewohnheiten, type GewohnheitStand } from "@/lib/gewohnheiten";
import { gewohnheitAbhaken } from "@/lib/gewohnheiten-actions";
import { GewohnheitenDialog } from "@/components/gewohnheiten-dialog";
import { EinrichtungHinweis } from "@/components/einrichtung-hinweis";
import { Card, CardTitle, cx } from "@/components/ui";
import { heuteISO, weekStart as toWeekStart } from "@/lib/time";
import { tradingConfigured, WEEKLY_BACKTEST_ZIEL } from "@/lib/supabase/trading";
import { fetchWeeklyNativeBacktestCount } from "@/lib/supabase/backtest";

/**
 * Die Gewohnheiten als eine Reihe Zeilen — der ganze tägliche Umgang mit dem
 * Tracker besteht aus einem Druck pro Zeile.
 *
 * Rechts stehen die sieben Punkte der Woche und die Zahl, wegen der es den
 * Tracker gibt: wie oft diese Woche. Wo ein Wochenziel gesetzt ist, steht es
 * dahinter, sonst nur die Zahl — ein Ziel zu erfinden, nur damit die Anzeige
 * vollständig aussieht, macht aus einer Beobachtung eine Bewertung.
 *
 * Zwei Arten von Zeilen, und das ist Absicht:
 *
 * **Selbst eingetragene** — ein Druck hakt heute ab. Gewohnheiten mit Datum
 * oder Varianten öffnen stattdessen den Dialog, weil „heute, ohne nähere
 * Angabe" bei einem Training schlicht falsch wäre.
 *
 * **Automatisch gezählte** — die Backtest-Trades ganz unten. Sie stehen hier
 * und nicht in einer eigenen Karte daneben: es ist dieselbe Frage („wie oft
 * diese Woche") und dieselbe Zeile. Eine zweite Karte nur für eine einzige
 * Zahl war genau die Zersplitterung, die die Startseite unlesbar macht.
 * Gedrückt wird sie nicht — was gezählt wird, hakt man nicht ab.
 *
 * @param bereich Nur Gewohnheiten dieses Bereichs (z. B. "gym"), oder alle.
 * @param titel   Überschrift der Karte.
 * @param leer    Was steht da, wenn es keine Gewohnheit gibt. Null blendet
 *                die Karte aus — so verhält sie sich wie jede andere Karte
 *                der Startseite.
 * @param mitBacktest Zeigt die automatisch gezählte Backtest-Zeile.
 */
export async function GewohnheitenKarte({
  bereich = null, titel = "Gewohnheiten", leer = null, mitBacktest = false,
}: {
  bereich?: string | null;
  titel?: string;
  leer?: string | null;
  mitBacktest?: boolean;
}) {
  const heute = heuteISO();
  const [{ gewohnheiten, tabelleFehlt }, backtest] = await Promise.all([
    ladeGewohnheiten(bereich),
    mitBacktest && tradingConfigured()
      ? fetchWeeklyNativeBacktestCount(toWeekStart(heute), heute)
      : Promise.resolve(null),
  ]);

  // Fehlende Migration ist KEIN „nichts anzuzeigen": stilles Ausblenden hat
  // hier einen halben Tag Suche gekostet, weil die Startseite nicht zwischen
  // „nicht eingerichtet" und „nichts zu tun" unterschied.
  if (tabelleFehlt) {
    return (
      <EinrichtungHinweis titel={titel}
        datei="19_habits.sql + 20_habits_varianten.sql" ziel="/gewohnheiten" />
    );
  }

  const backtestZeile = backtest === null ? null : (
    <GezaehlteZeile
      name="Backtest-Trades" icon="◈" farbe="#8B94B8"
      anzahl={backtest} ziel={WEEKLY_BACKTEST_ZIEL} href="/trading/backtest" />
  );

  if (gewohnheiten.length === 0) {
    if (!leer && !backtestZeile) return null;
    return (
      <Card>
        <Kopf titel={titel} />
        {leer && <p className="text-sm text-ink-muted">{leer}</p>}
        {backtestZeile && <ul className="mt-2 space-y-1">{backtestZeile}</ul>}
      </Card>
    );
  }

  return (
    <Card>
      <Kopf titel={titel} />
      <ul className="space-y-1">
        {gewohnheiten.map((h) => (
          <li key={h.id}>
            <Eintragen h={h} heute={heute} />
          </li>
        ))}
        {backtestZeile}
      </ul>
    </Card>
  );
}

function Kopf({ titel }: { titel: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <CardTitle className="mb-0">{titel}</CardTitle>
      <Link href="/gewohnheiten" className="text-xs text-accent-soft hover:underline">
        Verlauf ↗
      </Link>
    </div>
  );
}

/**
 * Der Weg zum Eintragen — je nach Gewohnheit ein Druck oder ein Dialog.
 *
 * Ein Formular je Zeile statt einem grossen: so schickt der Klick genau eine
 * Zeile. Der gewünschte Zustand steht im Formular und wird nicht aus der
 * Datenbank gelesen — zwei schnelle Klicks heben sich dann sauber auf, statt
 * sich gegenseitig zu überholen.
 */
export function Eintragen({ h, heute }: { h: GewohnheitStand; heute: string }) {
  if (h.mitDatum || h.varianten.length > 0) {
    return <GewohnheitenDialog h={h} heute={heute} kind={<Zeile h={h} />} />;
  }

  return (
    <form action={gewohnheitAbhaken}>
      <input type="hidden" name="id" value={h.id} />
      {/* Leerer Wert heisst „Haken weg" — `txt()` liest ihn als falsch. */}
      <input type="hidden" name="getan" value={h.heuteGetan ? "" : "1"} />
      <button type="submit" className="w-full text-left">
        <Zeile h={h} />
      </button>
    </form>
  );
}

/** Wie eine Zeile aussieht. Ob sie drückt oder öffnet, entscheidet `Eintragen`. */
function Zeile({ h }: { h: GewohnheitStand }) {
  const geschafft = h.zielProWoche > 0 && h.dieseWoche >= h.zielProWoche;

  return (
    <span className={cx(
      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
      "transition duration-150 ease-tactile hover:bg-sand/60 active:scale-[0.99]",
      h.heuteGetan ? "text-ink" : "text-ink-soft")}>
      <span aria-hidden
        className={cx(
          "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg border text-[12px]",
          h.heuteGetan
            ? "border-good/50 bg-good-tint text-good-bright"
            : "border-line-strong text-transparent")}
        style={h.heuteGetan ? undefined : { borderColor: h.farbe + "66" }}>
        ✓
      </span>

      <span className="min-w-0 flex-1 truncate">
        {h.icon && <span className="mr-1.5">{h.icon}</span>}
        {h.name}
        {/* Die Aufteilung der Woche: „2× Push · 1× Ausdauer". Nur wenn es
            überhaupt etwas aufzuteilen gibt. */}
        {h.wocheNachVariante.length > 0 && (
          <span className="ml-2 text-[11px] text-ink-faint">
            {h.wocheNachVariante.map((v) => `${v.anzahl}× ${v.variante}`).join(" · ")}
          </span>
        )}
      </span>

      {/* So viele Kästchen, wie das Wochenziel vorgibt — nicht sieben. Bei
          einem Ziel von vier sähe eine erfüllte Woche sonst dauerhaft zu drei
          Siebteln leer aus: die Anzeige stellte jede erreichte Woche als
          Mangel dar. Ohne Ziel steht hier gar nichts. */}
      {h.woche.gesamt > 0 && (
        <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
          {Array.from({ length: h.woche.gesamt }, (_, i) => (
            <span key={i}
              className={cx("h-[9px] w-[9px] rounded-[3px] border",
                i < h.woche.gefuellt
                  ? "border-transparent"
                  : "border-line-strong/70 bg-transparent")}
              style={i < h.woche.gefuellt ? { background: h.farbe } : undefined} />
          ))}
          {/* Was über das Ziel hinausgeht, wird nicht abgeschnitten. */}
          {h.woche.ueber > 0 && (
            <span className="tabular ml-0.5 text-[10px] text-ink-faint">
              +{h.woche.ueber}
            </span>
          )}
        </span>
      )}

      {h.streak > 1 && (
        <span className="tabular hidden shrink-0 text-[11px] text-ink-faint lg:inline">
          {h.streak}d
        </span>
      )}

      <span className={cx("tabular shrink-0 text-xs",
        geschafft ? "font-medium text-good" : "text-ink-muted")}>
        {h.dieseWoche}
        {h.zielProWoche > 0 && ` / ${h.zielProWoche}`}
        <span className="ml-1 text-ink-faint">diese Woche</span>
      </span>
    </span>
  );
}

/**
 * Eine Zeile, die sich selbst zählt — dieselbe Optik, aber kein Haken.
 *
 * Das leere Kästchen der anderen Zeilen fehlt bewusst: es würde zum Drücken
 * einladen, und ein Druck täte hier nichts. Stattdessen ein Punkt in der
 * Farbe und ein Pfeil zur Quelle.
 */
function GezaehlteZeile({
  name, icon, farbe, anzahl, ziel, href,
}: {
  name: string;
  icon: string;
  farbe: string;
  anzahl: number;
  ziel: number;
  href: string;
}) {
  return (
    <li>
      <Link href={href}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
          "transition duration-150 ease-tactile hover:bg-sand/60 active:scale-[0.99]",
          anzahl > 0 ? "text-ink" : "text-ink-soft")}>
        <span aria-hidden
          className="grid h-[22px] w-[22px] shrink-0 place-items-center">
          <span className="h-2 w-2 rounded-full" style={{ background: farbe }} />
        </span>

        <span className="min-w-0 flex-1 truncate">
          <span className="mr-1.5">{icon}</span>
          {name}
          <span className="ml-2 text-[11px] text-ink-faint">zählt sich selbst</span>
        </span>

        <span className={cx("tabular shrink-0 text-xs",
          anzahl >= ziel ? "font-medium text-good" : "text-ink-muted")}>
          {anzahl} / {ziel}
          <span className="ml-1 text-ink-faint">diese Woche</span>
        </span>
      </Link>
    </li>
  );
}
