"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTradingClient } from "@/lib/supabase/trading";
import { tradingUserId } from "@/lib/trading/journal";
import { GVA_NOTIZ } from "@/lib/trading/herkunft";
import { findeDuplikat, type Kandidat, type Neuling } from "@/lib/trading/duplikat";
import { saubereName, STANDARD_KONFLUENZEN } from "@/lib/trading/konfluenzen";
import {
  pruefeBild, bildPfad, pfadAusUrl, EIMER,
} from "@/lib/trading/screenshots";
import { antwortenAusFormular } from "@/lib/trading/journal-fragen";
import { lageFesthalten } from "@/lib/trading/lage-festhalten";

/**
 * Schreibzugriffe aufs Trading-Journal.
 *
 * Eigene Datei statt `lib/actions.ts`: Die dortige Sammlung ist auf 139
 * Aktionen und 133 KB gewachsen, und Next bündelt eine `"use server"`-Datei
 * als Einheit — wer eine Aktion importiert, zieht den Eintrag für alle. Der
 * Journal-Teil startet deshalb gleich als eigener Baustein, so wie es
 * `backtest-actions.ts` und `trading-actions.ts` schon vormachen.
 *
 * Jede Aktion setzt `user_id` selbst. Der Service-Key umgeht RLS — was hier
 * vergessen wird, merkt die Datenbank nicht (siehe `lib/trading/journal.ts`).
 */

/** Alle Journal-Seiten, die eine Änderung sehen müssen. */
const JOURNAL_PFADE = [
  "/trading/journal",
  "/trading/journal/trades",
  "/trading/journal/equity",
  "/trading/journal/konten",
  "/trading/cockpit",
];

/**
 * Gezielt statt `revalidatePath("/")`. Der Pauschalschlag steht 35-mal in
 * `actions.ts` und wirft bei jeder Kleinigkeit den Cache der ganzen App weg —
 * ein Trade-Eintrag hat mit dem Menüplan nichts zu tun.
 */
function journalAktualisieren(extra: string[] = []) {
  for (const p of [...JOURNAL_PFADE, ...extra]) revalidatePath(p);
}

async function zugang() {
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");
  const userId = await tradingUserId();
  if (!userId) {
    throw new Error(
      "Kein Benutzer in der Trading-Datenbank gefunden. TRADING_USER_ID in .env.local setzen.",
    );
  }
  return { supabase, userId };
}

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string): number | null => {
  const v = txt(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const flag = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/**
 * Kandidaten aus der Datenbank holen und den ersten Treffer suchen.
 *
 * Vorgefiltert wird nur auf Paar und Richtung — das Feinurteil (Datum in
 * Toleranz, Einstieg in Pip-Toleranz) trifft `findeDuplikat`, weil es dort
 * ohne Datenbank prüfbar ist.
 */
async function sucheDuplikat(
  supabase: NonNullable<ReturnType<typeof createTradingClient>>, neu: Neuling,
): Promise<Kandidat | null> {
  if (neu.entryPrice === null) return null;

  const { data } = await supabase.from("trades")
    .select("id, symbol, side, date, entry_price, r_multiple, status")
    .eq("symbol", neu.pair).eq("side", neu.direction)
    .order("date", { ascending: false }).limit(40);

  const kandidaten: Kandidat[] = ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: String(t.id),
    pair: String(t.symbol ?? ""),
    direction: String(t.side ?? ""),
    date: String(t.date ?? "").slice(0, 10),
    entryPrice: t.entry_price === null ? null : Number(t.entry_price),
    rMultiple: Number(t.r_multiple ?? 0),
    status: String(t.status ?? "closed"),
  }));

  return findeDuplikat(neu, kandidaten);
}

/** Die Eingaben als Adresszeile, damit das Formular gefüllt zurückkommt. */
function zurueck(fd: FormData): string {
  const p = new URLSearchParams();
  for (const feld of [
    "pair", "direction", "date", "result", "rMultiple", "riskAmount",
    "profitAmount", "entryPrice", "stopLoss", "takeProfit", "notes", "type",
  ]) {
    const v = txt(fd, feld);
    if (v) p.set(feld, v);
  }
  return p.toString();
}

export async function tradeSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();

  const id = txt(fd, "id");
  const ergebnis = txt(fd, "result");
  const rRoh = num(fd, "rMultiple");
  const risiko = num(fd, "riskAmount");
  const gewinn = num(fd, "profitAmount");

  /*
   * R aus Risiko und Gewinn, wenn beides dasteht — sonst aus der Eingabe.
   *
   * Die Brücke kann das Risiko nur messen, wenn sie den Stop gesehen hat.
   * Kerim setzt ihn oft erst nach dem Einstieg; sieht sie ihn nie, bleibt
   * `risk_amount` leer und das R war bis zum 27.08.2026 dauerhaft 0. Jetzt
   * trägt er das Risiko im Formular nach und das R folgt daraus, statt eine
   * zweite, von Hand geschätzte Zahl danebenzustellen.
   *
   * Vorzeichen: R trägt es, nicht der Betrag. Ein Verlust von 250 auf 250
   * Risiko ist −1 R, kein +1.
   */
  const gerechnet = risiko !== null && risiko > 0 && gewinn !== null
    ? Math.round((gewinn / risiko) * 100) / 100
    : null;

  // Bei einem Verlust ohne erfassten Wert ist −1R die ehrlichste Annahme:
  // Kerim handelt mit festem Risiko, ein Stop-Out ist genau 1R.
  const r = gerechnet ?? (
    ergebnis === "loss" ? -Math.abs(rRoh ?? 1) : Math.abs(rRoh ?? 0));

  const zeile: Record<string, unknown> = {
    user_id: userId,
    type: txt(fd, "type") || "ek",
    symbol: txt(fd, "pair").toUpperCase(),
    side: txt(fd, "direction") || "long",
    date: txt(fd, "date"),
    result: ergebnis || null,
    status: "closed",
    session_type: txt(fd, "sessionType") || "backtest",
    session: txt(fd, "session"),
    r_multiple: r,
    risk_percent: num(fd, "riskPercent"),
    risk_amount: risiko,
    profit_amount: gewinn,
    entry_price: num(fd, "entryPrice"),
    exit_price: num(fd, "exitPrice"),
    stop_loss: num(fd, "stopLoss"),
    take_profit: num(fd, "takeProfit"),
    lot_size: num(fd, "lotSize"),
    notes: txt(fd, "notes"),
    comment: txt(fd, "comment"),
    strategy_id: txt(fd, "strategyId") || null,
    outlook_id: txt(fd, "outlookId") || null,
    setup_3day_gva: flag(fd, "setup_dreiTagesGva"),
    setup_weekly_gva: flag(fd, "setup_weeklyGva"),
    setup_daily_bos: flag(fd, "setup_dailyBos"),
    setup_value_area: flag(fd, "setup_valueArea"),
    setup_market_structure: flag(fd, "setup_marketStructure"),
    confluences: fd.getAll("confluences").map(String).filter(Boolean),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("trades").update(zeile).eq("id", id).eq("user_id", userId);
  } else {
    /*
     * Duplikatprüfung — nur beim Anlegen, nie beim Bearbeiten.
     *
     * Die MT5-Brücke trägt Trades selbst ein, und Kerim trägt sie manchmal
     * von Hand nach, weil er nicht sicher ist, ob sie es getan hat. Zwei
     * Zeilen für denselben Trade verdoppeln die Stichprobe und verfälschen
     * jede Kennzahl, ohne dass man es der Zahl ansieht.
     *
     * Gewarnt wird, nicht blockiert: `trotzdem=1` legt trotzdem an. Eine
     * Sperre, die man nicht übergehen kann, kostet irgendwann einen echten
     * zweiten Einstieg am selben Level.
     */
    if (!txt(fd, "trotzdem")) {
      const doppelt = await sucheDuplikat(supabase, {
        pair: String(zeile.symbol),
        direction: String(zeile.side),
        date: String(zeile.date),
        entryPrice: zeile.entry_price as number | null,
      });
      if (doppelt) {
        // Die Eingaben gehen mit zurück, sonst müsste Kerim alles neu
        // tippen, nur um „trotzdem" zu drücken. Haken bei Setups und
        // Konfluenzen sind dabei nicht dabei — der Fall ist selten genug,
        // dass ein vollständiger Rücktransport den Aufwand nicht lohnt.
        redirect(`/trading/journal/trades?doppelt=${doppelt.id}&${zurueck(fd)}`);
      }
    }
    await supabase.from("trades").insert([zeile]);
  }

  /*
   * Kam der Trade aus einer Beobachtungs-Zeile, wird sie jetzt aufgelöst.
   *
   * Vorher blieb sie stehen, bis Kerim sie von Hand entfernte — und das
   * vergisst man, wenn der Trade längst gelaufen ist. Die Übersicht zeigte
   * dann Linien, die keine Beobachtung mehr sind. Erst NACH dem Schreiben:
   * scheitert der Trade, soll die Zeile bleiben.
   */
  const beobachtung = txt(fd, "watchlist_id");
  if (beobachtung) {
    await supabase.from("trading_watchlist").delete().eq("id", beobachtung);
    revalidatePath("/trading");
    revalidatePath("/");
  }

  journalAktualisieren();
}

export async function tradeLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("trades").delete().eq("id", id).eq("user_id", userId);
  journalAktualisieren();
}

/**
 * Einen Trade im Journal nachbearbeiten — der Dialog hinter „bearbeiten".
 *
 * Seit 22.09.2026. Anders als `tradeSpeichern` schreibt diese Aktion NUR die
 * Felder, die der Dialog zeigt. Das ist der Punkt: die Brücke liefert Preise,
 * Lots, Status und Datum; ein Speichern über das volle Formular hätte davon
 * alles überschrieben, was dort nicht stand — und einen laufenden Trade
 * nebenbei auf „geschlossen" gesetzt.
 *
 * Betrag korrigieren: Die Brücke liest den Gewinn aus MT5, und der stimmt
 * nicht immer (Teilschliessungen, Kommission, Swap auf einer anderen
 * Position). Kerim gibt deshalb entweder den Prozentwert aufs Konto an
 * (Betrag = Kontostand × Prozent) oder direkt den Betrag in Franken. Das R
 * folgt aus Betrag ÷ Risiko.
 *
 * Gibt eine Meldung zurück statt zu werfen, damit der Dialog sie anzeigen
 * kann (meist: Migration noch nicht gelaufen).
 */
export async function tradeJournalSpeichern(
  fd: FormData,
): Promise<{ fehler: string | null; hinweis: string | null }> {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return { fehler: "Trade fehlt.", hinweis: null };

  const kontostand = num(fd, "accountBalance");
  const prozent = num(fd, "prozent");
  const risiko = num(fd, "riskAmount");
  const rEingabe = num(fd, "rMultiple");

  // Betrag: entweder direkt in Franken oder aus Prozent × Kontostand.
  // Fehlt die gewählte Angabe, bleibt der bisherige Wert der Brücke.
  const franken = num(fd, "franken");
  const betrag = txt(fd, "eingabe") === "franken"
    ? (franken ?? num(fd, "profitAmount"))
    : prozent !== null && kontostand !== null && kontostand > 0
      ? Math.round(kontostand * prozent) / 100
      : num(fd, "profitAmount");

  // Ergebnis: was gewählt ist; ohne Wahl aus dem Vorzeichen des Betrags.
  const gewaehlt = txt(fd, "result");
  const ergebnis = ["win", "loss", "breakeven"].includes(gewaehlt)
    ? gewaehlt as "win" | "loss" | "breakeven"
    : betrag === null ? null : betrag > 0 ? "win" : betrag < 0 ? "loss" : "breakeven";

  // R: aus Betrag ÷ Risiko, sonst die Eingabe mit dem Vorzeichen des Ergebnisses.
  let r: number;
  if (ergebnis === "breakeven") r = 0;
  else if (risiko !== null && risiko > 0 && betrag !== null) {
    r = Math.round((betrag / risiko) * 100) / 100;
  } else {
    const roh = Math.abs(rEingabe ?? 0);
    r = ergebnis === "loss" ? -(roh || 1) : roh;
  }

  const zeile: Record<string, unknown> = {
    result: ergebnis,
    account_balance: kontostand,
    profit_amount: betrag,
    risk_amount: risiko,
    r_multiple: r,
    notes: txt(fd, "notes"),
    confluences: fd.getAll("confluences").map(String).filter(Boolean),
    journal_fragen: antwortenAusFormular((k) => txt(fd, k), ergebnis),
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase.from("trades").update(zeile)
    .eq("id", id).eq("user_id", userId);

  // Spalte fehlt noch → ohne die Antworten speichern und es sagen.
  let hinweis: string | null = null;
  if (error && /journal_fragen/.test(error.message)) {
    delete zeile.journal_fragen;
    ({ error } = await supabase.from("trades").update(zeile)
      .eq("id", id).eq("user_id", userId));
    hinweis = "Gespeichert — aber ohne die Antworten auf die Fragen: die Spalte "
      + "journal_fragen fehlt noch. Migration supabase/trading/05_journal_und_hit_meldung.sql "
      + "in der Trading-Datenbank ausführen.";
  }
  if (error) return { fehler: `Speichern: ${error.message}`, hinweis: null };

  journalAktualisieren();
  return { fehler: null, hinweis };
}

/**
 * Die Fundamentallage für einen älteren Trade nachtragen. Der Stichtag ist
 * heute, nicht der Tag des Trades — der Dialog sagt das dazu.
 */
export async function lageNachtragen(fd: FormData): Promise<{ fehler: string | null }> {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return { fehler: "Trade fehlt." };

  const { data } = await supabase.from("trades").select("id, symbol, side")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  const t = data as { id: string; symbol: string; side: string | null } | null;
  if (!t) return { fehler: "Trade nicht gefunden." };

  const fehler = await lageFesthalten(
    t.id, t.symbol, t.side === "short" ? "short" : "long", "nachgetragen");
  if (!fehler) journalAktualisieren();
  return { fehler };
}

// ---------------------------------------------------------------------------
// Outlooks — die Thesen, aus denen später ein Trade wird
// ---------------------------------------------------------------------------

export async function outlookSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");

  const zeile: Record<string, unknown> = {
    user_id: userId,
    symbol: txt(fd, "symbol").toUpperCase(),
    direction: txt(fd, "direction") || "long",
    thesis: txt(fd, "thesis"),
    confidence: Number(txt(fd, "confidence") || 3),
    status: txt(fd, "status") || "observation",
    target_entry: num(fd, "targetEntry"),
    target_sl: num(fd, "targetSl"),
    target_tp: num(fd, "targetTp"),
    confluences: fd.getAll("confluences").map(String).filter(Boolean),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("outlooks").update(zeile).eq("id", id).eq("user_id", userId);
  } else {
    await supabase.from("outlooks").insert([{ ...zeile, source: "manual" }]);
  }

  journalAktualisieren();
}

export async function outlookStatusSetzen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  const status = txt(fd, "status");
  if (!id || !status) return;
  await supabase
    .from("outlooks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  journalAktualisieren();
}

export async function outlookSternSetzen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase
    .from("outlooks")
    .update({ is_starred: txt(fd, "wert") === "1", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  journalAktualisieren();
}

export async function outlookLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("outlooks").delete().eq("id", id).eq("user_id", userId);
  journalAktualisieren();
}

// ---------------------------------------------------------------------------
// Strategien
// ---------------------------------------------------------------------------

export async function strategieSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");

  // Kommagetrennte Eingabe ist hier bewusst: eine Mehrfachauswahl über 32
  // Paare wäre im Formular mehr Arbeit als das Tippen von "EURUSD, GBPUSD".
  const liste = (k: string) =>
    txt(fd, k).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  const zeile: Record<string, unknown> = {
    user_id: userId,
    name: txt(fd, "name"),
    description: txt(fd, "description"),
    direction: txt(fd, "direction") || "both",
    pairs: liste("pairs"),
    sessions: txt(fd, "sessions").split(",").map((s) => s.trim()).filter(Boolean),
    is_active: flag(fd, "isActive"),
    notes: txt(fd, "notes"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("strategies").update(zeile).eq("id", id).eq("user_id", userId);
  } else {
    await supabase.from("strategies").insert([zeile]);
  }

  journalAktualisieren(["/trading/journal/strategien"]);
}

export async function strategieLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("strategies").delete().eq("id", id).eq("user_id", userId);
  journalAktualisieren(["/trading/journal/strategien"]);
}

// ---------------------------------------------------------------------------
// Kontoführung
// ---------------------------------------------------------------------------

export async function kontoSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");

  const zeile: Record<string, unknown> = {
    user_id: userId,
    name: txt(fd, "name"),
    type: txt(fd, "type") === "funded" ? "funded" : "ek",
    broker: txt(fd, "broker"),
    currency: txt(fd, "currency") || "USD",
    initial_balance: num(fd, "initialBalance") ?? 0,
    current_balance: num(fd, "currentBalance") ?? num(fd, "initialBalance") ?? 0,
    default_risk_per_trade: num(fd, "risk") ?? 1,
    is_active: flag(fd, "isActive"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("accounts").update(zeile).eq("id", id).eq("user_id", userId);
  } else {
    await supabase.from("accounts").insert([zeile]);
  }

  journalAktualisieren(["/trading/journal/konten"]);
}

export async function kontoLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("accounts").delete().eq("id", id).eq("user_id", userId);
  journalAktualisieren(["/trading/journal/konten"]);
}

/**
 * Kontostand auf den berechneten Wert setzen.
 *
 * Bewusst ein eigener Knopf und keine automatische Korrektur: Wenn die
 * gerechnete und die hinterlegte Zahl auseinanderlaufen, will man das
 * *sehen* und nicht still bereinigt bekommen. Die Differenz ist fast immer
 * ein fehlender Betrag an einem Trade.
 */
export async function kontostandUebernehmen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  const wert = num(fd, "wert");
  if (!id || wert === null) return;
  await supabase
    .from("accounts")
    .update({ current_balance: wert, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  journalAktualisieren(["/trading/journal/konten"]);
}

export async function buchungSpeichern(fd: FormData) {
  const { supabase, userId } = await zugang();

  const betrag = num(fd, "amount");
  if (betrag === null) return;

  const art = txt(fd, "buchungsTyp");
  const kontoId = txt(fd, "accountId") || null;

  // Kontotyp vom Konto übernehmen, damit die Zeile auch dann zuordenbar
  // bleibt, wenn das Konto später gelöscht wird (account_id wird dann null).
  let typ = txt(fd, "type") || "ek";
  if (kontoId) {
    const { data } = await supabase
      .from("accounts").select("type").eq("id", kontoId).eq("user_id", userId).limit(1);
    const gefunden = data?.[0]?.type as string | undefined;
    if (gefunden) typ = gefunden;
  }

  await supabase.from("transactions").insert([{
    user_id: userId,
    account_id: kontoId,
    type: typ,
    transaction_type: ["deposit", "withdrawal", "payout"].includes(art) ? art : "deposit",
    amount: Math.abs(betrag),
    date: txt(fd, "date"),
    note: txt(fd, "note"),
  }]);

  journalAktualisieren(["/trading/journal/konten"]);
}

export async function buchungLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;
  await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId);
  journalAktualisieren(["/trading/journal/konten"]);
}

// ---------------------------------------------------------------------------
// Signale — die Inbox des Cockpits
// ---------------------------------------------------------------------------

/**
 * Status eines GVA-Hits setzen. Die vier Werte sind fix, weil der
 * Backend-Lebenszyklus (`TRIGGERED_STATUSES` / `CONSUMED_STATUSES` in
 * `Backend/supabase_signals.py`) genau sie liest — ein fünfter Wert würde
 * dort still ignoriert.
 */
const ddmm = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : null;

/** Alles, was eine Änderung an der aktiven Liste sehen muss. */
function listenAktualisieren() {
  revalidatePath("/trading");
  revalidatePath("/trading/cockpit");
  revalidatePath("/");
}

/**
 * Aus einem GVA-Hit einen aktiven Trade machen.
 *
 * **Warum das früher nicht funktioniert hat:** Diese Aktion legte einen
 * `outlooks`-Eintrag an und setzte das Signal auf „watchlist". Die sichtbare
 * Liste auf /trading liest aber `trading_watchlist` — eine andere Tabelle.
 * Der übernommene Hit landete damit in einem Topf, den keine Seite anzeigt:
 * Das Cockpit sagte „steht schon in Beobachtung", und zu sehen war nirgends
 * etwas. Man konnte ihn weder ansehen noch löschen noch zu einem Trade machen.
 *
 * Jetzt schreibt sie in dieselbe Tabelle wie das Formular auf /trading. Eine
 * Liste, ein Ort zum Löschen, ein Ort zum Weiterarbeiten — egal ob die Zeile
 * von Hand entstanden ist oder aus dem Screener.
 */
export async function signalUebernehmen(fd: FormData) {
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const id = txt(fd, "id");
  const pair = txt(fd, "pair").toUpperCase().replace(/[^A-Z]/g, "");
  const richtung = txt(fd, "lineType") === "short" ? "short" : "long";
  const level = num(fd, "lineLevel");
  const formiert = ddmm(txt(fd, "formiert") || null);
  if (!id || !pair) return;

  const zeile = {
    pair,
    side: richtung,
    line_level: level,
    note: formiert ? `${GVA_NOTIZ}, Linie vom ${formiert}` : GVA_NOTIZ,
    // Voreinstellungen wie im Formular auf /trading. Wer sie anders will,
    // ändert sie dort — hier zählt, dass die Zeile überhaupt entsteht.
    alarm_on_hit: true,
    alarm_time: null,
    show_until: null,
    archived: false,
  };

  // Gleiches Paar UND gleiches Level gilt als dieselbe Linie — sonst legt ein
  // zweiter Klick eine Karteileiche daneben. Dieselbe Regel wie in
  // `addWatchlistPair`; `null` braucht `is` statt `eq`.
  const suche = supabase
    .from("trading_watchlist").select("id")
    .eq("pair", pair).eq("archived", false);
  const { data: gleiche } = level === null
    ? await suche.is("line_level", null).limit(1)
    : await suche.eq("line_level", level).limit(1);

  const treffer = ((gleiche ?? []) as { id: string }[])[0];
  const { error } = treffer
    ? await supabase.from("trading_watchlist").update(zeile).eq("id", treffer.id)
    : await supabase.from("trading_watchlist").insert(zeile);
  if (error) throw new Error(`Aktive Trades: ${error.message}`);

  await supabase
    .from("signals")
    .update({ status: "watchlist", updated_at: new Date().toISOString() })
    .eq("id", id);

  listenAktualisieren();
}

/**
 * Einen Hit verwerfen — auch dann, wenn er vorher übernommen wurde.
 *
 * Der zweite Teil ist der wichtige: Solange „verwerfen" nur das Signal
 * umgesetzt hat, blieb eine bereits übernommene Zeile in der aktiven Liste
 * stehen, und umgekehrt liess sich ein übernommener Hit im Cockpit gar nicht
 * mehr anfassen — dort stand nur noch „hier gibt es nichts mehr zu
 * entscheiden". Eine Entscheidung, die man nicht zurücknehmen kann, ist eine
 * Falle, keine Entscheidung.
 */
export async function signalVerwerfen(fd: FormData) {
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const id = txt(fd, "id");
  const pair = txt(fd, "pair").toUpperCase().replace(/[^A-Z]/g, "");
  const level = num(fd, "lineLevel");
  if (!id) return;

  await supabase
    .from("signals")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Die zugehörige Zeile in der aktiven Liste mitnehmen, falls es sie gibt.
  // Verknüpft wird über Paar und Level — dieselbe Kennung, unter der sie
  // angelegt wurde. Eine eigene Spalte dafür wäre eine Verknüpfung, die man
  // pflegen muss, für eine Zeile, die man ohnehin von Hand löschen kann.
  if (pair && level !== null) {
    await supabase
      .from("trading_watchlist")
      .delete()
      .eq("pair", pair).eq("line_level", level).eq("archived", false);
  }

  listenAktualisieren();
}

/** Rohen Statuswechsel setzen — für Aufrufer ohne Paar-Kontext. */
export async function signalStatusSetzen(fd: FormData) {
  const supabase = createTradingClient();
  if (!supabase) throw new Error("Trading-Datenbank nicht verbunden");

  const id = txt(fd, "id");
  const status = txt(fd, "status");
  if (!id || !["new", "watchlist", "journaled", "dismissed"].includes(status)) return;

  await supabase
    .from("signals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  listenAktualisieren();
}

/* ------------------------------------------ Konfluenzen (27.08.2026) */

/**
 * Eine eigene Konfluenz anlegen.
 *
 * Beim allerersten Anlegen werden die acht Standardwerte **mitgeschrieben**.
 * Sonst wäre der erste eigene Eintrag zugleich der einzige, und Kerim stünde
 * mit einer Liste da, aus der sieben gewohnte Haken verschwunden sind — ohne
 * dass er etwas gelöscht hat.
 */
export async function konfluenzAnlegen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const name = saubereName(fd.get("name"));
  if (!name) return;

  const { data: schonDa } = await supabase
    .from("trading_konfluenzen").select("id, sort_order")
    .eq("user_id", userId).order("sort_order", { ascending: false });
  const liste = (schonDa ?? []) as { id: string; sort_order: number }[];

  if (liste.length === 0) {
    const grund = STANDARD_KONFLUENZEN.map((n, i) => ({
      user_id: userId, name: n, sort_order: i,
    }));
    const { error } = await supabase.from("trading_konfluenzen").insert(grund);
    if (error) {
      throw new Error(
        "Die Tabelle trading_konfluenzen fehlt. Die SQL steht auf dieser Seite: "
        + error.message,
      );
    }
  }

  const naechste = liste.length === 0
    ? STANDARD_KONFLUENZEN.length : Number(liste[0]?.sort_order ?? 0) + 1;

  // Doppelte Namen fängt der eindeutige Index ab — ein 23505 ist hier kein
  // Fehler, sondern die Antwort „gibt es schon".
  const { error } = await supabase.from("trading_konfluenzen")
    .insert({ user_id: userId, name, sort_order: naechste });
  if (error && error.code !== "23505") {
    throw new Error(`Konfluenz anlegen: ${error.message}`);
  }

  journalAktualisieren(["/trading/einstellungen"]);
}

export async function konfluenzLoeschen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const id = txt(fd, "id");
  if (!id) return;

  // Trades behalten den Namen: `confluences` ist ein Textfeld, kein Verweis.
  // Ein gelöschter Eintrag verschwindet aus dem Formular, nicht aus der
  // Vergangenheit — und taucht beim Bearbeiten eines alten Trades wieder auf
  // (siehe `konfluenzListe`).
  await supabase.from("trading_konfluenzen")
    .delete().eq("id", id).eq("user_id", userId);

  journalAktualisieren(["/trading/einstellungen"]);
}

/* ------------------------------------------- Screenshots (27.08.2026) */

/**
 * Ein Bild an einen Trade hängen.
 *
 * Der Eimer wird beim ersten Bild **selbst angelegt**. Sonst wäre der erste
 * Versuch ein Fehler mit der Aufforderung, im Supabase-Dashboard drei Knöpfe
 * zu drücken — und die sucht man abends nicht.
 *
 * Öffentlich lesbar: die URL steht im Journal und muss ohne Anmeldung
 * anzeigbar sein. Die Pfade tragen den Trade-Schlüssel und einen Zufall, sind
 * also nicht zu erraten. Wer die URL hat, sieht das Bild — das ist die
 * bewusste Abwägung gegen signierte Links, die alle paar Minuten ablaufen.
 */
export async function screenshotHochladen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const tradeId = txt(fd, "tradeId");
  const datei = fd.get("datei");
  if (!tradeId || !(datei instanceof File)) return;

  const { data: trade } = await supabase.from("trades")
    .select("id, screenshots").eq("id", tradeId).eq("user_id", userId).maybeSingle();
  if (!trade) return;

  const bisher = Array.isArray((trade as { screenshots?: string[] }).screenshots)
    ? (trade as { screenshots: string[] }).screenshots : [];

  const urteil = pruefeBild(datei.type, datei.size, bisher.length);
  if (!urteil.ok) {
    redirect(`/trading/journal/trades?bearbeiten=${tradeId}&bildfehler=${encodeURIComponent(urteil.grund)}`);
  }

  // Fehlt der Eimer, anlegen. `createBucket` meldet einen bestehenden Eimer
  // als Fehler — der wird geschluckt, er ist die Normalantwort ab dem
  // zweiten Bild.
  await supabase.storage.createBucket(EIMER, { public: true }).catch(() => undefined);

  const pfad = bildPfad(tradeId, datei.type, Date.now(), Math.random().toString(36).slice(2));
  const { error: hochFehler } = await supabase.storage.from(EIMER)
    .upload(pfad, datei, { contentType: datei.type, upsert: false });
  if (hochFehler) {
    redirect(`/trading/journal/trades?bearbeiten=${tradeId}&bildfehler=${encodeURIComponent(hochFehler.message)}`);
  }

  const { data: oeffentlich } = supabase.storage.from(EIMER).getPublicUrl(pfad);
  await supabase.from("trades")
    .update({ screenshots: [...bisher, oeffentlich.publicUrl] })
    .eq("id", tradeId).eq("user_id", userId);

  journalAktualisieren();
  redirect(`/trading/journal/trades?bearbeiten=${tradeId}`);
}

/**
 * Ein Bild wieder wegnehmen.
 *
 * Erst aus der Zeile, dann aus dem Speicher. Andersherum bliebe bei einem
 * Fehler eine URL stehen, hinter der nichts mehr liegt — ein kaputtes Bild im
 * Journal ist schlimmer als eine verwaiste Datei im Eimer.
 */
export async function screenshotEntfernen(fd: FormData) {
  const { supabase, userId } = await zugang();
  const tradeId = txt(fd, "tradeId");
  const url = txt(fd, "url");
  if (!tradeId || !url) return;

  const { data: trade } = await supabase.from("trades")
    .select("id, screenshots").eq("id", tradeId).eq("user_id", userId).maybeSingle();
  if (!trade) return;

  const bisher = Array.isArray((trade as { screenshots?: string[] }).screenshots)
    ? (trade as { screenshots: string[] }).screenshots : [];

  await supabase.from("trades")
    .update({ screenshots: bisher.filter((u) => u !== url) })
    .eq("id", tradeId).eq("user_id", userId);

  const pfad = pfadAusUrl(url);
  if (pfad) await supabase.storage.from(EIMER).remove([pfad]);

  journalAktualisieren();
  redirect(`/trading/journal/trades?bearbeiten=${tradeId}`);
}
