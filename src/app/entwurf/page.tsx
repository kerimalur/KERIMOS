import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Tagessatz } from "@/components/tagessatz";
import { AppointmentsCard } from "@/components/appointments-card";
import { TasksCard } from "@/components/tasks-card";
import { PrepCard } from "@/components/prep-card";
import { Logo } from "@/components/logo";
import { QuickSearch } from "@/components/quick-search";
import { Tagesstrahl } from "@/components/tagesstrahl";
import { fetchModusKennzahlen } from "@/lib/modus-kennzahlen";
import { MODE_ORDER, MODE_DIRECT } from "@/lib/modes";
import type { NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Entwurf einer Startseite, die kein Dashboard mehr ist.
 *
 * Der Unterschied zur bisherigen Seite: Hier steht nichts, was in einen
 * Modus gehört. Kein Trading-Status, keine Kalorien, kein Verlauf - das
 * alles lebt in Gym, Essen, Trading. Übrig bleiben drei Dinge:
 *
 *   1. Was ist heute anders als sonst (ein Satz, plus Wetter)
 *   2. Was verlangt heute eine Entscheidung (nur wenn es etwas gibt)
 *   3. Wo arbeitest du jetzt (die Modi, gross und als Einstieg)
 *
 * Wenn nichts ansteht, ist die Seite fast leer. Das ist das Ziel, nicht ein
 * Mangel - eine leere Startseite heisst "alles im Griff".
 */
export default async function EntwurfStartseite() {
  const supabase = await createClient();

  const [{ data: linkRows }, kennzahlen] = await Promise.all([
    supabase.from("links").select("*").eq("archived", false)
      .order("sort_order").order("title"),
    fetchModusKennzahlen(),
  ]);

  const links = (linkRows ?? []) as NavLink[];

  const gruppen = new Map<string, NavLink[]>();
  for (const l of links) {
    const g = l.group_name ?? "Sonstiges";
    gruppen.set(g, [...(gruppen.get(g) ?? []), l]);
  }

  const modi = [...gruppen.entries()].sort(
    (a, b) =>
      ((MODE_ORDER.indexOf(a[0]) + 1) || 99) - ((MODE_ORDER.indexOf(b[0]) + 1) || 99) ||
      a[0].localeCompare(b[0]),
  );

  return (
    <div className="py-6">
      <div className="mb-6 flex items-start gap-3.5">
        <Logo inverted className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <Tagessatz />
        </div>
      </div>

      {/* Der Tag als Strahl: Arbeit, Termine, erfasste Zeit auf einen Blick. */}
      <Tagesstrahl />

      <div className="mb-6">
        <QuickSearch links={links} />
      </div>

      {/* Was heute eine Entscheidung braucht. Jede dieser Karten blendet
          sich selbst aus, wenn nichts ansteht - dann ist hier schlicht
          nichts, und das ist die gute Nachricht. */}
      <div className="mb-7 space-y-3">
        <TasksCard />
        <AppointmentsCard />
        <PrepCard />
      </div>

      {/* Wo arbeitest du jetzt */}
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        Wo arbeitest du
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modi.map(([name, ls], i) => {
          const ziel = MODE_DIRECT[name] ?? `/m/${encodeURIComponent(name)}`;
          const mitBild = ls.find((l) => l.image_url);
          const farbe = ls[0]?.color ?? "#9A8C74";

          return (
            <Link key={name} href={ziel}
              className="group relative flex aspect-[16/10] animate-pop flex-col justify-end
                         overflow-hidden rounded-2xl border border-line/70 bg-card shadow-tile
                         transition duration-200 ease-tactile
                         hover:-translate-y-1 hover:border-line-strong active:scale-[0.98]"
              style={{
                animationDelay: `${i * 55}ms`,
                boxShadow: `0 14px 28px -18px ${farbe}55`,
              }}>
              {mitBild?.image_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mitBild.image_url} alt=""
                    style={{ objectPosition: mitBild.image_position ?? "50% 50%" }}
                    className="absolute inset-0 h-full w-full object-cover transition
                               duration-300 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t
                                  from-black/85 via-black/40 to-black/5" />
                </>
              ) : (
                <div className="absolute inset-0" style={{ background: farbe + "26" }}>
                  <span className="absolute right-4 top-3 text-5xl opacity-30"
                    style={{ color: farbe }}>
                    {ls[0]?.icon ?? name[0]}
                  </span>
                </div>
              )}
              <div className="relative p-4">
                <span className="font-display text-lg font-bold text-white drop-shadow">
                  {name}
                </span>
                {/* Die zwei bis drei Zahlen, die den Blick lohnen. Damit ist
                    die Kachel kein Türschild mehr, sondern sagt schon von
                    aussen, ob es sich lohnt hineinzugehen. */}
                {kennzahlen[name] && (
                  <ul className="mt-1 space-y-0.5">
                    {kennzahlen[name].map((z, j) => (
                      <li key={j}
                        className={
                          "truncate text-[11px] drop-shadow " +
                          (z.betont ? "font-medium text-white" : "text-white/70")
                        }>
                        {z.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-ink-faint">
        Entwurf ·{" "}
        <Link href="/" className="transition hover:text-ink-muted">
          zur bisherigen Startseite
        </Link>
      </p>
    </div>
  );
}
