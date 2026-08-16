import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Bar } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { chf } from "@/lib/format";

/**
 * Die zwei Fragen, um die es beim Geld wirklich geht:
 * "Wie viel komme ich pro Monat vorwärts?" und "Wo geht es hin?"
 *
 * Bewusst gegen den Durchschnitt der abgeschlossenen Monate gerechnet, nicht
 * gegen den laufenden: am 3. des Monats sind erst ein paar Buchungen da, ein
 * Überschuss daraus wäre jeden Monatsanfang euphorisch und falsch. Der
 * laufende Monat steht als Zwischenstand daneben.
 */
export async function GeldVorwaerts() {
  const supabase = await createClient();
  const heute = new Date();
  const laufenderMonat = heute.toISOString().slice(0, 7);

  // Sechs Monate zurück, ohne Umbuchungen zwischen eigenen Konten.
  const seit = new Date(heute.getFullYear(), heute.getMonth() - 6, 1)
    .toISOString().slice(0, 10);

  const [{ data: txns }, { data: kategorien }] = await Promise.all([
    supabase.from("transactions")
      .select("amount, occurred_on, category_id")
      .eq("is_transfer", false)
      .gte("occurred_on", seit),
    supabase.from("categories").select("id, name"),
  ]);

  const liste = txns ?? [];
  if (liste.length === 0) return null;

  const katName = new Map((kategorien ?? []).map((k) => [k.id as string, k.name as string]));

  // Pro Monat Ein- und Ausgaben
  const monate = new Map<string, { ein: number; aus: number }>();
  // Ausgaben je Kategorie, nur abgeschlossene Monate
  const proKategorie = new Map<string, number>();
  let abgeschlosseneMonate = 0;

  for (const t of liste) {
    const monat = String(t.occurred_on).slice(0, 7);
    const betrag = Number(t.amount);

    const m = monate.get(monat) ?? { ein: 0, aus: 0 };
    if (betrag >= 0) m.ein += betrag;
    else m.aus += Math.abs(betrag);
    monate.set(monat, m);

    if (betrag < 0 && monat !== laufenderMonat) {
      const name = t.category_id
        ? katName.get(t.category_id as string) ?? "Ohne Kategorie"
        : "Ohne Kategorie";
      proKategorie.set(name, (proKategorie.get(name) ?? 0) + Math.abs(betrag));
    }
  }

  const abgeschlossen = [...monate.entries()].filter(([m]) => m !== laufenderMonat);
  abgeschlosseneMonate = Math.max(1, abgeschlossen.length);

  const schnittEin = abgeschlossen.reduce((s, [, m]) => s + m.ein, 0) / abgeschlosseneMonate;
  const schnittAus = abgeschlossen.reduce((s, [, m]) => s + m.aus, 0) / abgeschlosseneMonate;
  const vorwaerts = schnittEin - schnittAus;

  const laufend = monate.get(laufenderMonat);
  const laufendSaldo = laufend ? laufend.ein - laufend.aus : null;

  // Top-Kategorien als Monatsschnitt
  const top = [...proKategorie.entries()]
    .map(([name, summe]) => ({ name, proMonat: summe / abgeschlosseneMonate }))
    .sort((a, b) => b.proMonat - a.proMonat)
    .slice(0, 7);

  const maxKat = Math.max(1, ...top.map((k) => k.proMonat));
  const ohneKategorie = top.find((k) => k.name === "Ohne Kategorie");

  return (
    <Card className="p-5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        Vorwärts pro Monat
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <CountUp
          value={Math.round(vorwaerts)}
          prefix={vorwaerts >= 0 ? "+ " : ""}
          suffix=" CHF"
          className={
            "font-display text-3xl font-bold tabular-nums " +
            (vorwaerts >= 0 ? "text-good-bright" : "text-bad-bright")
          }
        />
        <span className="text-xs text-ink-muted">
          Ø aus {abgeschlosseneMonate} {abgeschlosseneMonate === 1 ? "Monat" : "Monaten"}
          {" · "}{chf(Math.round(schnittEin))} ein, {chf(Math.round(schnittAus))} aus
        </span>
      </div>

      {laufendSaldo !== null && (
        <p className="mt-1 text-xs text-ink-muted">
          Laufender Monat bisher{" "}
          <span className={laufendSaldo >= 0 ? "text-good" : "text-accent"}>
            {laufendSaldo >= 0 ? "+" : ""}{chf(Math.round(laufendSaldo))}
          </span>
        </p>
      )}

      {/* Wo es hingeht */}
      {top.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line/70 pt-3">
          {top.map((k) => (
            <li key={k.name}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className={
                  "truncate text-sm " +
                  (k.name === "Ohne Kategorie" ? "text-warn" : "text-ink-soft")
                }>
                  {k.name}
                </span>
                <span className="tabular shrink-0 text-sm text-ink">
                  {chf(Math.round(k.proMonat))}
                </span>
              </div>
              <Bar pct={(k.proMonat / maxKat) * 100}
                color={k.name === "Ohne Kategorie" ? "#C98A3F" : "#E7A96B"} />
            </li>
          ))}
        </ul>
      )}

      {ohneKategorie && (
        <Link href="/transaktionen?ohne=1"
          className="mt-3 inline-block text-xs text-accent-soft transition hover:underline">
          {chf(Math.round(ohneKategorie.proMonat))} im Monat sind noch nicht zugeordnet —
          jetzt zuordnen →
        </Link>
      )}
    </Card>
  );
}
