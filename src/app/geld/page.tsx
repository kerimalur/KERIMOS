import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chf } from "@/lib/format";
import { heuteISO } from "@/lib/time";
import { Card, CardTitle, Badge, Empty } from "@/components/ui";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Geld — eine Seite, eine Frage: wofür ging das Geld?
 *
 * Vorher waren es sieben Seiten: Cockpit, Analyse, Runway, Konten,
 * Fixkosten, Ziele, Offene. Gebraucht wurde davon eine Sache — zu sehen,
 * wo Geld hingeht, das da nicht hingehen sollte. Alles andere zeigt die
 * Bank ohnehin und besser, weil es dort ohne Pflege aktuell ist.
 *
 * Was hier zusätzlich zur Bank steht, ist der Vergleich mit dem Vormonat.
 * Der beantwortet die Frage „ist das viel?", und genau die kann eine
 * Umsatzliste nicht beantworten.
 */

interface Zeile { kategorie: string; jetzt: number; vorher: number }

/** Monatsanfang als ISO, `zurueck` Monate in der Vergangenheit. */
function monatsStart(zurueck: number): string {
  const d = new Date(`${heuteISO()}T12:00:00`);
  d.setDate(1);
  d.setMonth(d.getMonth() - zurueck);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monatsName(iso: string): string {
  return new Date(`${iso}T12:00:00`)
    .toLocaleDateString("de-CH", { month: "long", year: "numeric" });
}

export default async function GeldPage() {
  const db = await createClient();
  const dieserMonat = monatsStart(0);
  const letzterMonat = monatsStart(1);

  const [{ data: buchungen }, { data: kategorien }, offeneZahl] = await Promise.all([
    db.from("transactions")
      .select("amount, category_id, occurred_on, is_transfer, description")
      .gte("occurred_on", letzterMonat).lt("amount", 0).eq("is_transfer", false)
      .order("occurred_on", { ascending: false }),
    db.from("categories").select("id, name"),
    db.from("transactions").select("id", { count: "exact", head: true })
      .is("category_id", null).eq("is_transfer", false).lt("amount", 0),
  ]);

  const name = new Map(
    ((kategorien ?? []) as { id: string; name: string }[]).map((k) => [k.id, k.name]),
  );

  const proKategorie = new Map<string, Zeile>();
  for (const b of (buchungen ?? []) as Transaction[]) {
    const kat = b.category_id ? (name.get(b.category_id) ?? "Unbekannt") : "Nicht zugeordnet";
    const betrag = Math.abs(Number(b.amount));
    const z = proKategorie.get(kat) ?? { kategorie: kat, jetzt: 0, vorher: 0 };
    if (b.occurred_on >= dieserMonat) z.jetzt += betrag; else z.vorher += betrag;
    proKategorie.set(kat, z);
  }

  const zeilen = [...proKategorie.values()]
    .filter((z) => z.jetzt > 0 || z.vorher > 0)
    .sort((a, b) => b.jetzt - a.jetzt);

  const summeJetzt = zeilen.reduce((s, z) => s + z.jetzt, 0);
  const summeVorher = zeilen.reduce((s, z) => s + z.vorher, 0);
  const groesste = Math.max(...zeilen.map((z) => Math.max(z.jetzt, z.vorher)), 1);
  const offen = offeneZahl.count ?? 0;

  // Auffällig heisst: mehr als die Hälfte über dem Vormonat UND mindestens
  // 50 Franken Unterschied. Ohne die zweite Bedingung wäre jede Kategorie
  // auffällig, in der letzten Monat zufällig nichts lief.
  const auffaellig = zeilen.filter(
    (z) => z.vorher > 0 && z.jetzt > z.vorher * 1.5 && z.jetzt - z.vorher >= 50,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">Geld</h1>
          <span className="tabular text-sm text-ink-muted">{monatsName(dieserMonat)}</span>
          {offen > 0 && (
            <Link href="/transaktionen">
              <Badge tone="warn">{offen} ohne Kategorie</Badge>
            </Link>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Wofür ging das Geld — und wo ist es mehr als sonst. Kontostände,
          Runway und Fixkosten zeigt dir Raiffeisen aktueller, als es hier je
          gepflegt wäre.
        </p>
      </div>

      {auffaellig.length > 0 && (
        <Card>
          <CardTitle>Das fällt auf</CardTitle>
          <ul className="space-y-1.5">
            {auffaellig.map((z) => (
              <li key={z.kategorie}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-tint px-3 py-2 text-sm">
                <span className="font-medium text-ink">{z.kategorie}</span>
                <span className="tabular text-ink-soft">{chf(Math.round(z.jetzt))}</span>
                <span className="text-xs text-ink-muted">
                  statt {chf(Math.round(z.vorher))} im Vormonat
                </span>
                <span className="tabular ml-auto text-xs font-medium text-accent">
                  +{Math.round(((z.jetzt - z.vorher) / z.vorher) * 100)} %
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="mb-0">Ausgaben nach Kategorie</CardTitle>
          <span className="tabular text-sm text-ink-muted">
            {chf(Math.round(summeJetzt))}
            {summeVorher > 0 && (
              <span className="ml-2 text-xs">
                Vormonat {chf(Math.round(summeVorher))}
              </span>
            )}
          </span>
        </div>

        {zeilen.length === 0 ? (
          <Empty>
            Für diesen und den letzten Monat sind keine Ausgaben erfasst.{" "}
            <Link href="/import" className="text-accent-soft hover:underline">
              Kontoauszug importieren
            </Link>
          </Empty>
        ) : (
          <ul className="space-y-2.5">
            {zeilen.map((z) => (
              <li key={z.kategorie}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className={z.kategorie === "Nicht zugeordnet"
                    ? "text-accent" : "text-ink"}>
                    {z.kategorie}
                  </span>
                  <span className="tabular text-ink-soft">
                    {chf(Math.round(z.jetzt))}
                    {z.vorher > 0 && (
                      <span className="ml-2 text-xs text-ink-faint">
                        {z.jetzt > z.vorher ? "+" : ""}
                        {Math.round(z.jetzt - z.vorher)}
                      </span>
                    )}
                  </span>
                </div>
                {/* Zwei Balken übereinander: dieser Monat kräftig, der
                    Vormonat blass dahinter. Ein Zahlenvergleich allein sagt
                    nicht, ob 300 Franken viel sind - der Vormonat schon. */}
                <div className="relative h-[7px] overflow-hidden rounded-full bg-sand">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-line-strong/40"
                    style={{ width: `${(z.vorher / groesste) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    style={{ width: `${(z.jetzt / groesste) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3.5 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-ink-faint">
          Kräftig ist dieser Monat, blass der Vormonat. Nur Ausgaben, keine
          Umbuchungen.{" "}
          <Link href="/transaktionen" className="text-accent-soft hover:underline">
            Einzelne Buchungen
          </Link>{" "}
          ·{" "}
          <Link href="/kategorien" className="text-accent-soft hover:underline">
            Kategorien
          </Link>{" "}
          ·{" "}
          <Link href="/import" className="text-accent-soft hover:underline">
            Import
          </Link>
        </p>
      </Card>
    </div>
  );
}
