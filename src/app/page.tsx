import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FocusPrompt } from "@/components/focus-prompt";
import { TradingCard } from "@/components/trading-card";
import { TodayCard } from "@/components/today-card";
import { QuickSearch } from "@/components/quick-search";
import { Button, Card } from "@/components/ui";
import { seedLinks } from "@/lib/actions";
import { MODE_ORDER } from "@/lib/modes";
import { addDays, weekStart as toWeekStart } from "@/lib/time";
import type { Activity, FocusSession, NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Start({
  searchParams,
}: {
  searchParams: Promise<{ voll?: string }>;
}) {
  // Handys landen auf /heute - ausser sie wollen ausdrücklich die volle
  // Ansicht (?voll=1, der "Alle Modi"-Link). Erkennung über den User-Agent;
  // iPads zählen bewusst als Desktop.
  const sp = await searchParams;
  const ua = (await headers()).get("user-agent") ?? "";
  if (!sp.voll && /Android.*Mobile|iPhone/i.test(ua)) redirect("/heute");

  const supabase = await createClient();
  const vorwoche = addDays(toWeekStart(new Date()), -7);

  const [
    { data: linkRows }, { data: focusRows }, { data: actRows }, { data: lastReview },
  ] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
    supabase.from("weekly_reviews").select("id").eq("week_start", vorwoche).maybeSingle(),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <h1 className="text-lg font-medium text-ink">Navigator einrichten</h1>
          <p className="mt-2 text-sm text-ink-muted">
            KerimOS legt dir Kacheln für deine Modi an — Traden, Programmieren,
            Gym, Essen, Geld, Zeit. Alles danach änderbar — Kacheln verwaltest
            du in der App, nicht im Code.
          </p>
          <form action={seedLinks} className="mt-5">
            <Button type="submit" className="w-full">Kacheln anlegen</Button>
          </form>
        </Card>
      </div>
    );
  }

  // Sonntag (0) und Montag (1): sanft erinnern, solange der Rückblick fehlt
  const wochentag = new Date().getDay();
  const reviewFehlt = !lastReview && (wochentag === 0 || wochentag === 1);

  // Modi = Kachel-Gruppen
  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    const list = gruppen.get(l.group_name) ?? [];
    list.push(l);
    gruppen.set(l.group_name, list);
  }
  const modi = [...gruppen.entries()].sort(
    (a, b) =>
      ((MODE_ORDER.indexOf(a[0]) + 1) || 99) - ((MODE_ORDER.indexOf(b[0]) + 1) || 99) ||
      a[0].localeCompare(b[0])
  );

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-lg font-medium text-white">
            K
          </span>
          <div>
            <h1 className="text-2xl font-medium leading-tight text-ink">KerimOS</h1>
            <p className="text-sm text-ink-muted">Was willst du jetzt tun?</p>
          </div>
        </div>
        <QuickSearch links={links} />
      </div>

      <div className="space-y-5">
        <TradingCard />
        <TodayCard />

        {reviewFehlt && (
          <Link href={`/rueckblick?w=${vorwoche}`}
            className="block rounded-2xl border border-warn/30 bg-warn-tint px-5 py-3 text-sm text-ink-soft transition hover:border-warn/60">
            Der Wochenrückblick für letzte Woche fehlt noch — 5 Minuten, die Felder
            sind schon vorbefüllt. →
          </Link>
        )}

        <FocusPrompt
          sessions={(focusRows ?? []) as FocusSession[]}
          activities={(actRows ?? []) as Activity[]}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modi.map(([name, ls]) => (
            <Link key={name} href={`/m/${encodeURIComponent(name)}`}
              className="group rounded-2xl border border-line/70 bg-card p-5 transition hover:border-line-strong">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-base text-white"
                  style={{ background: ls[0]?.color ?? "#8A8478" }}>
                  {ls[0]?.icon ?? name[0]}
                </span>
                <div className="min-w-0">
                  <div className="text-base font-medium text-ink">{name}</div>
                  <div className="text-xs text-ink-muted">
                    {ls.length} {ls.length === 1 ? "Kachel" : "Kacheln"}
                  </div>
                </div>
              </div>
              <p className="mt-3 truncate text-xs text-ink-muted">
                {ls.slice(0, 3).map((l) => l.title).join(" · ")}
                {ls.length > 3 && " · …"}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-line pt-4">
        <div className="flex items-center gap-4">
          <Link href="/links" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Kacheln verwalten
          </Link>
          <Link href="/fokus" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Fokus
          </Link>
          <Link href="/zuruecksetzen" className="text-xs text-ink-muted transition hover:text-ink-soft">
            Zurücksetzen
          </Link>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-xs text-ink-muted transition hover:text-ink-soft">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
