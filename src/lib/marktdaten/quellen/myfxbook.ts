/**
 * Retail-Sentiment: Myfxbook „Community Outlook" (Long/Short-Anteile der
 * Privatanleger je Symbol). Die API verlangt ein kostenloses Myfxbook-Konto:
 * MYFXBOOK_EMAIL und MYFXBOOK_PASSWORD in Vercel. Ohne beide überspringt der
 * Job still (kein Fehler).
 */

export interface SentimentZeile {
  symbol: string;
  long_pct: number;
  short_pct: number;
  long_lots: number | null;
  short_lots: number | null;
  long_positionen: number | null;
  short_positionen: number | null;
}

const BASIS = "https://www.myfxbook.com/api";

export function myfxbookKonfiguriert(): boolean {
  return Boolean(process.env.MYFXBOOK_EMAIL?.trim() && process.env.MYFXBOOK_PASSWORD?.trim());
}

async function holeJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "kerimos" } });
  if (!res.ok) throw new Error(`Myfxbook HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchSentiment(): Promise<SentimentZeile[]> {
  const email = process.env.MYFXBOOK_EMAIL?.trim();
  const passwort = process.env.MYFXBOOK_PASSWORD?.trim();
  if (!email || !passwort) throw new Error("MYFXBOOK_EMAIL / MYFXBOOK_PASSWORD fehlen");

  const login = await holeJson(`${BASIS}/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(passwort)}`);
  if (login.error || typeof login.session !== "string") throw new Error(`Myfxbook-Login: ${String(login.message ?? "fehlgeschlagen")}`);
  const sitzung = login.session;
  try {
    const daten = await holeJson(`${BASIS}/get-community-outlook.json?session=${encodeURIComponent(sitzung)}`);
    if (daten.error) throw new Error(`Myfxbook: ${String(daten.message ?? "Fehler")}`);
    const symbole = (daten.symbols ?? []) as Record<string, unknown>[];
    const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    return symbole
      .map((s) => ({
        symbol: String(s.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
        long_pct: Number(s.longPercentage),
        short_pct: Number(s.shortPercentage),
        long_lots: n(s.longVolume),
        short_lots: n(s.shortVolume),
        long_positionen: n(s.longPositions),
        short_positionen: n(s.shortPositions),
      }))
      .filter((s) => s.symbol && Number.isFinite(s.long_pct) && Number.isFinite(s.short_pct));
  } finally {
    // Sitzung beenden, Myfxbook begrenzt gleichzeitige Sitzungen.
    await holeJson(`${BASIS}/logout.json?session=${encodeURIComponent(sitzung)}`).catch(() => undefined);
  }
}
