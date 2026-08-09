import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createGymClient, gymConfigured } from "@/lib/supabase/gym";
import { fetchTodayMenu, menuConfigured } from "@/lib/supabase/menu";
import { fetchScreener, BACKTEST_ZIEL } from "@/lib/supabase/trading";
import { fetchNativeBacktestTrades } from "@/lib/supabase/backtest";
import { computeNativeBacktestStats } from "@/lib/backtest-types";
import { heuteISO } from "@/lib/time";

/**
 * Je Modus die zwei bis drei Zahlen, die den Blick lohnen.
 *
 * Der Sinn: Die Startseite bleibt leer von Karten, aber die Kacheln sind
 * nicht mehr blosse Türschilder. Man sieht beim Vorbeischauen, ob es sich
 * lohnt hineinzugehen - ohne dass Details die Seite fluten.
 *
 * Jede Zeile ist bewusst kurz. Passt etwas nicht auf eine Kachel, gehört es
 * in den Modus selbst.
 */

export interface ModusZeile {
  text: string;
  /** Hervorgehoben, wenn es eine Handlung nahelegt. */
  betont?: boolean;
}

export type ModusDaten = Record<string, ModusZeile[]>;

const std = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const nr = (n: number) => Math.round(n).toLocaleString("de-CH");

export async function fetchModusKennzahlen(): Promise<ModusDaten> {
  const heute = heuteISO();
  const monat = heute.slice(0, 7);
  const daten: ModusDaten = {};

  const supabase = await createClient();
  const gym = gymConfigured() ? createGymClient() : null;

  const [gymTeil, essenTeil, geldTeil, zeitTeil, tradenTeil] = await Promise.all([
    // ---------------------------------------------------------------- Gym
    (async (): Promise<ModusZeile[]> => {
      if (!gym) return [];
      const [{ data: letzte }, { data: tag }] = await Promise.all([
        gym.from("v_exercise_progress")
          .select("day, split").order("day", { ascending: false }).limit(1),
        gym.from("garmin_daily")
          .select("schritte, kalorien_gesamt, kalorien_aktiv")
          .eq("datum", heute).limit(1),
      ]);

      const zeilen: ModusZeile[] = [];
      const l = letzte?.[0] as { day: string; split: string | null } | undefined;

      if (l?.day === heute) {
        zeilen.push({ text: `${l.split ?? "Training"} heute erledigt` });
      } else {
        const dran =
          l?.split?.toLowerCase() === "pull" ? "Push"
            : l?.split?.toLowerCase() === "push" ? "Pull" : null;
        if (dran) zeilen.push({ text: `${dran} wäre dran`, betont: true });
      }

      // Immer anzeigen, auch bei null. Eine fehlende Zeile sieht aus wie ein
      // Fehler; "0 Schritte" um 6 Uhr morgens ist dagegen die Wahrheit und
      // zeigt nebenbei, dass die Uhr noch nicht synchronisiert hat.
      const t = tag?.[0] as
        { schritte: number | null; kalorien_gesamt: number | null } | undefined;
      zeilen.push({ text: `${nr(t?.schritte ?? 0)} Schritte` });
      zeilen.push({ text: `${nr(t?.kalorien_gesamt ?? 0)} kcal verbrannt` });

      return zeilen;
    })(),

    // -------------------------------------------------------------- Essen
    (async (): Promise<ModusZeile[]> => {
      // Nie stumm bleiben: eine leere Kachel sieht aus wie ein Fehler, auch
      // wenn nur nichts geplant ist. Deshalb sagt jeder Fall etwas.
      if (!menuConfigured()) return [{ text: "Menü-DB nicht verbunden" }];

      let menu = null;
      try {
        menu = await fetchTodayMenu();
      } catch {
        return [{ text: "Menü liess sich nicht laden" }];
      }

      if (!menu || menu.meals.length === 0) {
        return [{ text: "Heute nichts geplant", betont: true }];
      }

      // Alle Mahlzeiten des Tages, inklusive Snack - vier Zeilen passen auf
      // die Kachel. Je Mahlzeit Kalorien und Protein, weil das Protein für
      // Kerim die eigentliche Zielgrösse ist.
      const zeilen: ModusZeile[] = menu.meals.map((m) => {
        const kcal = nr(Number(m.kcal_total ?? 0));
        const protein = Number(m.protein_total ?? 0);
        return {
          text: protein > 0
            ? `${m.name} · ${kcal} kcal · ${nr(protein)} g`
            : `${m.name} · ${kcal} kcal`,
          betont: false,
        };
      });
      zeilen.push({
        text: `${nr(menu.kcal)} kcal · ${nr(menu.protein)} g Protein`,
        betont: true,
      });
      return zeilen;
    })(),

    // --------------------------------------------------------------- Geld
    (async (): Promise<ModusZeile[]> => {
      // 90 Tage laden statt nur den laufenden Monat: am Monatsanfang - oder
      // wenn der Kontoauszug länger nicht importiert wurde - wäre der
      // aktuelle Monat leer und die Kachel bliebe stumm. Dann zeigt sie den
      // jüngsten Monat mit Daten und sagt dazu, welcher das ist.
      const seit = new Date();
      seit.setDate(seit.getDate() - 90);

      const { data } = await supabase
        .from("transactions").select("amount, occurred_on")
        .eq("is_transfer", false)
        .gte("occurred_on", seit.toISOString().slice(0, 10));

      const liste = data ?? [];
      if (liste.length === 0) return [];

      const proMonat = new Map<string, { ein: number; aus: number }>();
      for (const t of liste) {
        const m = String(t.occurred_on).slice(0, 7);
        const eintrag = proMonat.get(m) ?? { ein: 0, aus: 0 };
        const b = Number(t.amount);
        if (b >= 0) eintrag.ein += b; else eintrag.aus += Math.abs(b);
        proMonat.set(m, eintrag);
      }

      const juengster = [...proMonat.keys()].sort().pop();
      if (!juengster) return [];

      const w = proMonat.get(juengster)!;
      const saldo = w.ein - w.aus;
      const aktuell = juengster === monat;
      const label = aktuell
        ? "diesen Monat"
        : new Date(`${juengster}-01T12:00:00`)
            .toLocaleDateString("de-CH", { month: "long" });

      const zeilen: ModusZeile[] = [
        { text: `${nr(w.ein)} ein · ${nr(w.aus)} aus` },
        { text: `${saldo >= 0 ? "+" : ""}${nr(saldo)} CHF ${label}`, betont: true },
      ];
      if (!aktuell) {
        zeilen.push({ text: "Auszug importieren", betont: true });
      }
      return zeilen;
    })(),

    // --------------------------------------------------------------- Zeit
    (async (): Promise<ModusZeile[]> => {
      // v_daily_time, nicht daily_time - es ist eine View. Der falsche Name
      // lieferte stumm null Zeilen, die Kachel blieb deshalb leer.
      const { data } = await supabase
        .from("v_daily_time")
        .select("ziel_minutes, unaccounted_minutes, logged_minutes")
        .eq("entry_date", heute).limit(1);

      const d = data?.[0] as {
        ziel_minutes: number; unaccounted_minutes: number; logged_minutes: number;
      } | undefined;

      if (!d) return [{ text: "Heute noch nichts erfasst", betont: true }];

      const zeilen: ModusZeile[] = [];
      zeilen.push({ text: `${std(Number(d.logged_minutes ?? 0))} erfasst` });
      if (Number(d.ziel_minutes) > 0) {
        zeilen.push({ text: `davon ${std(Number(d.ziel_minutes))} an Zielen` });
      }
      if (Number(d.unaccounted_minutes) >= 30) {
        zeilen.push({
          text: `${std(Number(d.unaccounted_minutes))} offen`, betont: true,
        });
      }
      return zeilen;
    })(),

    // ------------------------------------------------------------- Traden
    (async (): Promise<ModusZeile[]> => {
      const zeilen: ModusZeile[] = [];

      // Der Backtest-Stand kommt aus dem nativen Journal (/trading/backtest),
      // nicht aus backtest_sessions - dort steht der automatisierte
      // Engine-Backtest, gemeint ist aber der von Hand durchgespielte.
      const trades = await fetchNativeBacktestTrades();
      if (trades.length > 0) {
        const stand = computeNativeBacktestStats(trades);
        zeilen.push({
          text: `Backtest ${stand.gewertet}/${BACKTEST_ZIEL}`,
          betont: stand.gewertet < BACKTEST_ZIEL,
        });
        if (stand.winrate !== null) {
          zeilen.push({
            text: `${stand.winrate.toFixed(0)} % Winrate · ${stand.gesamtR.toFixed(1)} R`,
          });
        }
      }

      // Am Wochenende ist der Markt zu - Setups wären dort ohne Aussage.
      const tag = new Date().getDay();
      if (tag !== 0 && tag !== 6) {
        try {
          const screener = await fetchScreener();
          const pairs = (screener?.data ?? []) as { status?: string; pair?: string }[];
          const hits = pairs.filter((p) => p.status === "HIT");
          if (hits.length > 0) {
            zeilen.push({
              text: `${hits.length} GVA-Hit: ${hits.map((h) => h.pair).join(", ")}`,
              betont: true,
            });
          }
        } catch {
          // Screener offline ändert nichts am Backtest-Stand
        }
      }

      return zeilen;
    })(),
  ]);

  if (tradenTeil.length) daten.Traden = tradenTeil;
  if (gymTeil.length) daten.Gym = gymTeil;
  if (essenTeil.length) daten.Essen = essenTeil;
  if (geldTeil.length) daten.Geld = geldTeil;
  if (zeitTeil.length) daten.Zeit = zeitTeil;

  return daten;
}
