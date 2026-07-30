import Link from "next/link";
import { PlanDay } from "@/components/plan-day";
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import { fetchDayView, fetchRangeTotals } from "@/lib/supabase/menu";
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
  const ansicht: Ansicht =
    sp.ansicht === "woche" || sp.ansicht === "monat" ? sp.ansicht : "tag";
  const datum = ISO.test(sp.d ?? "") ? sp.d! : heuteISO();
  const heute = heuteISO();

  const tabs: { key: Ansicht; label: string }[] = [
    { key: "tag", label: "Tag" },
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

  /* ------------------------------- Tag ------------------------------- */
  if (ansicht === "tag") {
    const tag = await fetchDayView(datum);
    const wochentag = new Date(datum + "T12:00:00")
      .toLocaleDateString("de-CH", { weekday: "long" });

    return (
      <>
        {umschalter}

        <div className="flex items-center justify-between gap-3">
          <Link href={`/m/Essen/plan?ansicht=tag&d=${addDays(datum, -1)}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
            ←
          </Link>
          <div className="text-center">
            <div className="font-medium text-ink">{wochentag}</div>
            <div className="text-xs text-ink-muted">{dateLabel(datum)}</div>
          </div>
          <Link href={`/m/Essen/plan?ansicht=tag&d=${addDays(datum, 1)}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
            →
          </Link>
        </div>

        {!tag ? (
          <Empty>Menü-Datenbank nicht verbunden.</Empty>
        ) : (
          <PlanDay tag={tag} />
        )}
      </>
    );
  }

  /* ------------------------------ Woche ------------------------------ */
  if (ansicht === "woche") {
    const start = weekStart(datum);
    const ende = addDays(start, 6);
    const totals = await fetchRangeTotals(start, ende);
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
              <Link key={d} href={`/m/Essen/plan?ansicht=tag&d=${d}`}
                className="block rounded-xl border border-line/70 bg-card p-3 transition hover:border-line-strong">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className={cx("font-medium", d === heute ? "text-accent-soft" : "text-ink")}>
                    {dayNameShort(d)} {Number(d.slice(8, 10))}.
                  </span>
                  <span className="tabular text-ink-soft">{Math.round(kcal)} kcal</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-good"
                    style={{ width: `${anteil}%` }} />
                </div>
                {i === 6 && <span className="sr-only">Ende der Woche</span>}
              </Link>
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
  const totals = await fetchRangeTotals(erster, letzter);

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
              <Link key={iso} href={`/m/Essen/plan?ansicht=tag&d=${iso}`}
                className={cx(
                  "grid aspect-square place-items-center rounded-lg text-xs transition",
                  iso === heute ? "bg-accent text-white"
                    : voll ? "bg-good-tint text-ink"
                      : teilweise ? "bg-warn-tint text-ink"
                        : "text-ink-muted hover:bg-sand"
                )}>
                <span className="tabular font-medium">{Number(iso.slice(8, 10))}</span>
                {kcal > 0 && (
                  <span className={cx("text-[9px]",
                    iso === heute ? "text-white/80" : "text-ink-muted")}>
                    {Math.round(kcal)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </Card>
    </>
  );
}
