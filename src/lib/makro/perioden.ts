/** Perioden der Statistikämter ("2026-08", "2026-Q2", "2026") als Datum des Periodenbeginns. */

/** "2026-08" → 2026-08-01, "2026-Q2" → 2026-04-01, "2026" → 2026-01-01. */
export function periodeZuDatum(p: string): string | null {
  const s = p.trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{4})-?Q([1-4])$/.exec(s);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01-01`;
  m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

