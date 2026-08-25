import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardTitle, cx } from "@/components/ui";
import { TagMenue } from "@/components/essen/tag-menue";
import { fetchRangeTotals, fetchRangeMeals } from "@/lib/supabase/menu";
import { heuteISO, addDays, weekStart, dayNameShort, toISODate } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Ansicht = "tag" | "woche" | "monat";

export default async function EssenPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; d?: string }>;
}) {
  const sp = await searchParams;
  // Standard ist die Woche. Vorher war es der Tag — den zeigt jetzt die
  // Heute-Seite, und ein Tab, der sofort woanders hin umleitet, wäre kein Tab.
  const ansicht: Ansicht =
    sp.ansicht === "tag" || sp.ansicht === "monat" ? sp.ansicht : "woche";
  const datum = ISO.test(sp.d ?? "") ? sp.d! : heuteISO();
  const heute = heuteISO();

  const tabs: { key: Ansicht; label: string }[] = [
    { key: "woche", label: "Woche" },
    { key: "monat", label: "Monat" },
  ];

  const umschalter = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-xl bg-sand p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={`/m/Essen/plan?ansicht=${t.key}&d=${datum}`}
            className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
              ansicht === t.key ? "bg-card text-ink" : "text-ink-muted hover:text-ink-soft")}>
            {t.label}
          </Link>
        ))}
      </div>
      <Link href={`/m/Essen/plan?ansicht=${ansicht}&d=${heute}`}
        className="text-xs text-accent-soft transition hover:underline">
        Heute
      </Link>
    </div>
  );

  // Die Tagesansicht lebt seit dem 24.08.2026 auf der Heute-Seite: dort
  // stehen die Ringe darüber, und über die Pfeile ist sie für jeden Tag
  // zuständig. Zwei Tagesansichten hiessen zwei Stellen zum Pflegen — und
  // alte Lesezeichen sollen trotzdem ankommen, deshalb Umleitung statt 404.
  if (ansicht === "tag") redirect(`/m/Essen?d=${datum}`);

  /* ------------------------------ Woche ------------------------------ */
  if (ansicht === "woche") {
    const start = weekStart(datum);
    const ende = addDays(start, 6);
    const [totals, mahlzeiten] = await Promise.all([
      fetchRangeTotals(start, ende), fetchRangeMeals(start, ende),
    ]);
    const tage = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const gefuellt = tage.filter((d) => (totals.get(d)?.kcal ?? 0) > 0);
    const schnitt = gefuellt.length > 0
      ? gefuellt.reduce((s, d) => s + (totals.get(d)?.kcal ?? 0), 0) / gefuellt.length
      : 0;

    return (
      <>
        {umschalter}

        <div className="flex items-center justify-between gap-3">
          <Link href={`/m/Essen/plan?ansicht=woche&d=${addDays(start, -7)}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
            ←
          </Link>
          <span className="text-sm text-ink">
            {dateLabel(start)} – {dateLabel(ende)}
          </span>
          <Link href={`/m/Essen/plan?ansicht=woche&d=${addDays(start, 7)}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
            →
          </Link>
        </div>

        <Card>
          <CardTitle>Wochenschnitt</CardTitle>
          <p className="tabular text-sm text-ink-soft">
            {Math.round(schnitt)} kcal · {gefuellt.length} von 7 Tagen geplant
          </p>
        </Card>

        <div className="space-y-2">
          {tage.map((d, i) => {
            const kcal = totals.get(d)?.kcal ?? 0;
            const anteil = Math.min(100, (kcal / 2500) * 100);
            return (
              <div key={d}
                className="relative rounded-xl border border-line/70 bg-card p-3
                           transition hover:border-line-strong">
                {/* Die ganze Karte führt in den Tag — als Fläche UNTER dem
                    Inhalt, nicht als Klammer darum. Ein Knopf innerhalb eines
                    Links wäre ungültiges Markup, und ein Tipp auf die drei
                    Pünktchen würde zusätzlich navigieren. */}
                <Link href={`/m/Essen?d=${d}`}
                  aria-label={`${dayNameShort(d)} ${Number(d.slice(8, 10))}. öffnen`}
                  className="absolute inset-0 rounded-xl" />

                <div className="pointer-events-none relative mb-1.5 flex items-center gap-2 text-sm">
                  <span className={cx("font-medium", d === heute ? "text-accent-soft" : "text-ink")}>
                    {dayNameShort(d)} {Number(d.slice(8, 10))}.
                  </span>
                  <span className="tabular ml-auto text-ink-soft">{Math.round(kcal)} kcal</span>
                  <span className="pointer-events-auto">
                    <TagMenue datum={d} mahlzeiten={mahlzeiten.get(d) ?? []}
                      standardZiel={addDays(d, 1)} />
                  </span>
                </div>

                <div className="pointer-events-none relative h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-good"
                    style={{ width: `${anteil}%` }} />
                </div>
                {i === 6 && <span className="sr-only">Ende der Woche</span>}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  /* ------------------------------ Monat ------------------------------ */
  const d = new Date(datum + "T12:00:00");
  const jahr = d.getFullYear();
  const monat = d.getMonth();
  const erster = `${jahr}-${String(monat + 1).padStart(2, "0")}-01`;
  const letzter = toISODate(new Date(jahr, monat + 1, 0));
  const [totals, mahlzeiten] = await Promise.all([
    fetchRangeTotals(erster, letzter), fetchRangeMeals(erster, letzter),
  ]);

  const vorspann = (new Date(jahr, monat, 1).getDay() + 6) % 7;
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  const zellen: (string | null)[] = [
    ...Array.from({ length: vorspann }, () => null),
    ...Array.from({ length: tageImMonat }, (_, i) =>
      `${jahr}-${String(monat + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <>
      {umschalter}

      <div className="flex items-center justify-between gap-3">
        <Link href={`/m/Essen/plan?ansicht=monat&d=${toISODate(new Date(jahr, monat - 1, 1))}`}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
          ←
        </Link>
        <span className="text-sm text-ink">
          {d.toLocaleDateString("de-CH", { month: "long", year: "numeric" })}
        </span>
        <Link href={`/m/Essen/plan?ansicht=monat&d=${toISODate(new Date(jahr, monat + 1, 1))}`}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
          →
        </Link>
      </div>

      <Card>
        <div className="mb-2 grid grid-cols-7 gap-1">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
            <span key={w} className="text-center text-[10px] uppercase tracking-wide text-ink-muted">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {zellen.map((iso, i) => {
            if (!iso) return <span key={`leer-${i}`} />;
            const kcal = totals.get(iso)?.kcal ?? 0;
            const voll = kcal >= 1800;
            const teilweise = kcal > 0 && !voll;
            return (
              <div key={iso} className="relative">
                <Link href={`/m/Essen?d=${iso}`}
                  className={cx(
                    "grid aspect-square place-items-center rounded-lg text-xs transition",
                    iso === heute ? "bg-accent text-ink-on"
                      : voll ? "bg-good-tint text-ink"
                        : teilweise ? "bg-warn-tint text-ink"
                          : "text-ink-muted hover:bg-sand"
                  )}>
                  <span className="tabular font-medium">{Number(iso.slice(8, 10))}</span>
                  {kcal > 0 && (
                    <span className={cx("text-[9px]",
                      iso === heute ? "text-ink-on/80" : "text-ink-muted")}>
                      {Math.round(kcal)}
                    </span>
                  )}
                </Link>
                {/* Neben dem Link, nicht darin. Zeigt sich nur an Tagen mit
                    Mahlzeiten; das Auswahlfenster legt sich als Blatt über
                    den Bildschirm, weil eine Kachel dafür zu schmal ist. */}
                <span className="absolute right-0 top-0">
                  <TagMenue datum={iso} mahlzeiten={mahlzeiten.get(iso) ?? []}
                    standardZiel={addDays(iso, 1)} variante="blatt" />
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
