import "server-only";
import { G8 } from "@/lib/supabase/trading";
import { ladeMakro } from "@/lib/makro/laden";
import { ladeReleases, ladeUrteile } from "@/lib/makro/releases-laden";
import { makroDb } from "@/lib/makro/speichern";
import { fmtAbweichung } from "@/lib/makro/releases";
import { ladeRueckblick, standardWoche } from "@/lib/makro/rueckblick";
import { ladeMarkt } from "@/lib/markt/laden";
import { addDays, heuteISO, weekStart } from "@/lib/time";

/**
 * Makro und Markt für den MCP-Server (11.10.2026).
 *
 * Läuft ohne Browser-Sitzung, deshalb überall der Service-Client (`makroDb`)
 * — Kompass hat genau einen Benutzer. Die Funktionen formen nur um, die
 * Regeln stehen in lib/makro und lib/markt, dieselben wie in der App.
 */

function dienst() {
  const db = makroDb();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt (Projekt Kompass).");
  return db;
}

const rund = (x: number | null, n = 2) => (x === null ? null : Math.round(x * 10 ** n) / 10 ** n);

/** Termine mit Erwartung UND Ist aus makro_releases (MT5-Kalender), nicht mehr aus calendar_events. */
export async function mcpKalender(
  zeitraum: "heute" | "woche" | "vorwoche" | "naechste_woche", impact: "high" | "alle",
) {
  const db = dienst();
  const montag = weekStart(heuteISO());
  const [von, bis] = zeitraum === "heute" ? [heuteISO(), addDays(heuteISO(), 1)]
    : zeitraum === "woche" ? [montag, addDays(montag, 7)]
      : zeitraum === "vorwoche" ? [addDays(montag, -7), montag]
        : [addDays(montag, 7), addDays(montag, 14)];
  // Zürich liegt bis zu 2 Stunden vor UTC: ein Puffer, damit der Tagesrand nichts verschluckt.
  const ab = new Date(Date.parse(`${von}T00:00:00Z`) - 2 * 3_600_000).toISOString();
  const ende = new Date(Date.parse(`${bis}T00:00:00Z`) - 2 * 3_600_000).toISOString();

  const alle = await ladeReleases({ ab, bis: ende, db });
  const gefiltert = alle.filter((r) => impact === "alle" || (r.impact ?? "").toLowerCase() === "high");
  return {
    zeitraum, von, bis, impact,
    hinweis: "Quelle: makro_releases (MT5-Kalender). Ist leer = noch nicht veröffentlicht oder nicht zugeordnet. "
      + "ueberraschung: positiv = besser als erwartet für die Währung (Arbeitslosigkeit schon umgedreht). Zeiten in UTC.",
    anzahl: gefiltert.length,
    termine: gefiltert.map((r) => ({
      zeit: r.event_time, waehrung: r.ccy, titel: r.titel, kategorie: r.kategorie, impact: r.impact,
      erwartung: r.erwartung, ist: r.ist, vorher: r.vorwert, einheit: r.einheit,
      abweichung: r.abweichung === null ? null : fmtAbweichung(r.abweichung, r.einheit),
      ueberraschung: rund(r.z), istQuelle: r.ist_quelle,
    })),
  };
}

/** Das Urteil je Währung mit Teilen, Gründen und der auffälligsten News. */
export async function mcpMakroUrteil() {
  const db = dienst();
  const makro = await ladeMakro(db);
  const urteile = await ladeUrteile(makro.zeilen, G8, db);
  return {
    hinweis: "score von −1 (bearish) bis +1 (bullish). Modell seit 05.10.2026: nur Wirtschaft zählt; Zentralbank und Überraschung sind Anzeige.",
    waehrungen: G8.map((c) => {
      const u = urteile[c];
      return {
        waehrung: c, urteil: u.wort, score: rund(u.score),
        teile: { wirtschaft: rund(u.teile.wirtschaft), zentralbank: rund(u.teile.zentralbank), ueberraschung: rund(u.teile.ueberraschung) },
        gruende: u.gruende.slice(0, 5).map((g) => g.text),
        kernzahlen: u.kern.map((k) => ({
          name: k.label, wert: k.wert || null, stand: k.datum, vergleich: k.vergleich || null, trend: k.trend, fehlt: k.fehlt,
        })),
        auffaelligsteNews14Tage: u.nachricht
          ? { titel: u.nachricht.titel, zeit: u.nachricht.event_time, ist: u.nachricht.ist, erwartung: u.nachricht.erwartung, ueberraschung: rund(u.nachricht.z) }
          : null,
        naechsterZinsschritt: u.schritt,
      };
    }),
  };
}

/** Der Sonntags-Rückblick: Datenalter, Modell gegen die Woche, News mit Reaktion, Ampel für nächste Woche. */
export async function mcpWochenrueckblick(woche?: string) {
  const db = dienst();
  const r = await ladeRueckblick(woche ?? standardWoche(), Date.now(), db);
  return {
    woche: r.woche, bis: r.wocheEnde,
    datenalter: r.daten.map((d) => ({ quelle: d.name, stand: d.stand, alterTage: rund(d.alterTage, 1), ampel: d.ampel, hinweis: d.hinweis })),
    modell: {
      hinweis: r.ideenHinweis,
      ideen: r.ideen.map((i) => ({
        paar: i.idee.paar, seite: i.idee.seite, klasse: i.idee.klasse,
        starkGegenSchwach: `${i.idee.stark} gegen ${i.idee.schwach}`, prozentWoche1: i.prozent, pips: i.pips,
      })),
    },
    news: r.news.map((n) => ({
      zeit: n.release.event_time, waehrung: n.release.ccy, titel: n.release.titel,
      erwartung: n.release.erwartung, ist: n.release.ist, ueberraschung: rund(n.release.z),
      reaktionTagProzent: n.reaktion, messpaar: n.paar, inRichtungDerUeberraschung: n.inRichtung,
    })),
    naechsteWoche: r.naechste.map((n) => ({
      waehrung: n.ccy, urteil: n.urteil.wort, ampel: n.ampel, grund: n.grund,
      anstehendHighImpact: n.termine.map((t) => ({ zeit: t.event_time, titel: t.titel })),
    })),
  };
}

/** Linien, Bias, Check und Entscheidungen — der Markt-Tab als Daten. */
export async function mcpMarkt() {
  const m = await ladeMarkt(new Date(), dienst());
  const linie = (l: (typeof m.linien)[number]) => ({
    id: l.id, pair: l.pair, seite: l.side, level: l.line_level, warum: l.warum, notiz: l.note,
    prioritaet: l.prioritaet, fokus: l.fokus, zustand: l.zustand, abstandPips: rund(l.abstand, 1),
    preis: l.preis, preisVeraltet: l.preisVeraltet, trefferAlarmGemeldet: l.trefferGemeldet,
    check: { abgeholt: l.check_abgeholt, bos: l.check_bos, confluence: l.check_confluence },
    deinBias: l.bias_eigen, alarm: { bei_treffer: l.alarm_on_hit, nahAbPips: l.alarm_pips, uhrzeit: l.alarm_time?.slice(0, 5) ?? null },
    sichtbarBis: l.show_until, chart: l.chart_url,
    letzteEntscheidung: l.entscheidung ? { art: l.entscheidung.entscheidung, grund: l.entscheidung.grund, am: l.entscheidung.erstellt_am } : null,
    urteilFuerPaar: m.paare[l.pair]?.bias ?? null,
  });
  return {
    migrationFehlt: m.migrationFehlt,
    screenerStand: m.zahlen.screenerStand,
    zahlen: m.zahlen,
    faellig: m.linien.filter((l) => l.zustand === "erreicht" && !l.entscheidung).map((l) => l.id),
    linien: m.linien.map(linie),
    entscheidungen: m.entscheidungen.slice(0, 30).map((e) => ({
      am: e.erstellt_am, pair: e.pair, seite: e.seite, level: e.level, art: e.entscheidung, grund: e.grund,
      check: [e.check_abgeholt, e.check_bos, e.check_confluence], urteil: e.bias,
    })),
    archiv: m.archiv.slice(0, 10).map((l) => ({ pair: l.pair, level: l.line_level, grund: l.archiv_grund, am: l.archiviert_am })),
  };
}

/** Retail-Sentiment (Myfxbook) und COT-Nichtmeldepflichtige, je Paar der Watchlist und die Majors. */
export async function mcpSentiment() {
  const { createTradingClient } = await import("@/lib/supabase/trading");
  const db = createTradingClient();
  if (!db) throw new Error("Trading-Datenbank nicht verbunden");
  const { data } = await db.from("sentiment_snapshots").select("symbol, erfasst_am, long_pct, short_pct, long_lots, short_lots")
    .order("erfasst_am", { ascending: false }).limit(400);
  const zeilen = (data ?? []) as { symbol: string; erfasst_am: string; long_pct: number; short_pct: number; long_lots: number | null; short_lots: number | null }[];
  const letzte = new Map<string, (typeof zeilen)[number]>();
  for (const z of zeilen) if (!letzte.has(z.symbol)) letzte.set(z.symbol, z);
  const liste = [...letzte.values()];
  return {
    hinweis: liste.length === 0
      ? "Noch keine Daten: MYFXBOOK_EMAIL/MYFXBOOK_PASSWORD in Vercel setzen und /api/marktdaten-sync?job=sentiment aufrufen."
      : "Anteil der Privatanleger Long/Short. Kontraindikator: extrem einseitig (>70 %) spricht oft gegen die Masse. Quelle Myfxbook.",
    stand: liste[0]?.erfasst_am ?? null,
    symbole: liste.map((z) => ({
      symbol: z.symbol, longProzent: Number(z.long_pct), shortProzent: Number(z.short_pct),
      lotsLong: z.long_lots, lotsShort: z.short_lots,
      masse: Number(z.long_pct) >= 70 ? "extrem long" : Number(z.short_pct) >= 70 ? "extrem short" : "ausgewogen",
    })),
  };
}

/** Fundamentaler Beobachter: läuft er, und was hat er bisher herausgefunden? */
export async function mcpBeobachter(h: "1h" | "4h" | "1d" | "3d" | "5d" = "1d") {
  const { ladeBeobachter } = await import("@/lib/beobachter/laden");
  const s = await ladeBeobachter(h, 1);
  const g = (x: { titel: string; n: number; mittel: number; treffer: number | null; t: number | null; status: string }) => ({
    gruppe: x.titel, faelle: x.n, mittelProzent: x.mittel, trefferquote: x.treffer, t: x.t, status: x.status,
  });
  return {
    hinweis: "mittelProzent = Ø Bewegung des Messpaars in Richtung der Überraschung (positiv = Markt folgt). "
      + "Status: stabil (≥50 Fälle, |t|≥3, beide Zeithälften gleich), hinweis (≥30, |t|≥2), zufall, zuwenig. Nur 'stabil' taugt als Regel.",
    laeuft: s.lauf.ampel !== "schlecht" && s.kurse.ampel !== "schlecht" && !s.lauf.fehler,
    letzterLauf: s.lauf.gelaufen, kurseBis: s.kurse.bis, fehler: s.lauf.fehler,
    ereignisse: s.ereignisse, vollGemessen: s.vollGemessen, offen: s.offen, horizont: h,
    gesamt: g(s.gesamt),
    fazit: s.fazit,
    pruefstand: s.pruefstand.map((p) => ({
      id: p.h.id, frage: p.h.frage, horizont: p.h.horizont, urteil: p.urteil, begruendung: p.begruendung,
      faelle: p.ergebnis.n, mittelProzent: p.ergebnis.mittel, nachKostenProzent: p.ergebnis.netto, t: p.ergebnis.t,
      fehlendeFaelle: p.fehlendeFaelle,
    })),
    erkenntnisse: s.erkenntnisse.map((e) => ({ text: e.text, status: e.gruppe.status })),
    jeKategorie: s.jeKategorie.map(g),
    jeWaehrung: s.jeWaehrung.map(g),
  };
}
