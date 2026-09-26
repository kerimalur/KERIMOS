import type { HitLage } from "@/lib/trading/hit-detail";

/**
 * Die Fundamentallage zu einem Trade, eingefroren.
 *
 * Seit 22.09.2026. Das Cockpit-Popup rechnet die Lage (Ranking, COT, Saison)
 * jedes Mal neu — für einen laufenden Entscheid richtig, für ein Journal
 * falsch: drei Wochen später zeigt die Neuberechnung die Lage von heute, nicht
 * die, unter der der Trade entstand. Deshalb wird sie einmal gerechnet und in
 * `trades.fundamental_snapshot` abgelegt. Danach lädt nichts mehr nach.
 *
 * `quelle` sagt, wie nah das Bild am Einstieg ist:
 *   auto          vom Cron beim nächsten Lauf nach dem Import (Minuten danach)
 *   nachgetragen  von Hand im Journal — Stichtag ist der Tag des Klicks, nicht
 *                 der Tag des Trades. Die Anzeige sagt das dazu.
 *
 * Ohne `server-only`, damit der Dialog im Browser den Typ kennt.
 */
export interface LageSnapshot extends HitLage {
  erfasstAm: string;
  quelle: "auto" | "nachgetragen";
}

export function alsSnapshot(roh: unknown): LageSnapshot | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const s = roh as Partial<LageSnapshot>;
  // `ranking` ist die alte Q-Score-Form, `fundamental` die neue. Beide zählen:
  // Snapshots von vor dem 26.09.2026 sollen weiter lesbar bleiben, statt nach
  // dem Umbau als „keine Lage festgehalten" durchzufallen.
  if (typeof s.stichtag !== "string" || (!s.fundamental && !s.ranking)) return null;
  return s as LageSnapshot;
}

export const URTEIL_LABEL: Record<string, string> = {
  bestaetigt: "Die drei Ebenen bestätigen die Richtung",
  dagegen: "Die drei Ebenen sprechen dagegen",
  neutral: "Die drei Ebenen sagen nichts Klares",
  unbekannt: "Zu diesem Paar liegt kein Urteil vor",
};

/** Dieselben vier Fälle für die alten Q-Score-Snapshots. */
export const URTEIL_LABEL_ALT: Record<string, string> = {
  bestaetigt: "Ranking bestätigt die Richtung",
  dagegen: "Ranking spricht dagegen",
  neutral: "Ranking neutral",
  unbekannt: "Ranking unbekannt",
};
