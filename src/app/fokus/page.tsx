import { createClient } from "@/lib/supabase/server";
import { FocusStarter } from "@/components/focus-starter";
import { ZenTimer } from "@/components/zen-timer";

import type { Activity, FocusSession, NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FokusPage() {
  const supabase = await createClient();
  const [{ data: open }, { data: acts }, { data: linkRows }] = await Promise.all([
    supabase.from("focus_sessions").select("*").eq("status", "open")
      .order("started_at", { ascending: false }),
    supabase.from("activities").select("*").eq("archived", false).order("name"),
    supabase.from("links").select("*").eq("archived", false)
      .order("group_name").order("sort_order"),
  ]);

  const sessions = (open ?? []) as FocusSession[];
  const activities = (acts ?? []) as Activity[];
  const links = (linkRows ?? []) as NavLink[];
  const running = sessions[0] ?? null;

  // Alle Ziele der laufenden Sitzung, damit sie sich zusammen wieder öffnen lassen
  const ids = running?.link_ids?.length
    ? running.link_ids
    : running?.link_id ? [running.link_id] : [];
  const targets = ids
    .map((id) => links.find((l) => l.id === id))
    .filter((l): l is NavLink => Boolean(l))
    .map((l) => ({ target: l.target, kind: l.kind, title: l.title }));

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center py-10">
      {running ? (
        <ZenTimer session={running} activities={activities}
          others={sessions.length - 1} targets={targets} />
      ) : (
        <FocusStarter activities={activities} links={links} />
      )}
    </div>
  );
}
