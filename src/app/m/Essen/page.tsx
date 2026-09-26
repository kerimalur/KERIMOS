import { SeitenKopf } from "@/components/seiten-kopf";
import { EssenKalender } from "@/components/essen-kalender/kalender";
import { createClient } from "@/lib/supabase/server";
import { heuteISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Essen (26.09.2026): ein Monatskalender, ein Notizfeld pro Tag.
 *
 * Kerims Ansage: bewusst sein, was man isst — aber nicht mehr so genau wie
 * beim Tracken. Die alten Ansichten (Ringe, Plan, Rezepte, Einkauf …) sind
 * aus dem Frontend genommen und liegen im Backup, siehe
 * `_backup/kerimos-essen-2026-09-26/LIESMICH.md` und den Git-Tag
 * `essen-alt-2026-09-26`.
 */
export default async function EssenPage({
  searchParams,
}: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const heute = heuteISO();
  const monat = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : heute.slice(0, 7);

  const [j, m] = monat.split("-").map(Number);
  const erster = `${monat}-01`;
  const letzter = `${monat}-${String(new Date(Date.UTC(j, m, 0)).getUTCDate()).padStart(2, "0")}`;

  const supabase = await createClient();
  const { data } = await supabase.from("essen_notizen").select("datum, text")
    .gte("datum", erster).lte("datum", letzter);

  const notizen: Record<string, string> = {};
  for (const r of (data ?? []) as { datum: string; text: string }[]) notizen[r.datum] = r.text;

  return (
    <div className="py-2">
      <SeitenKopf titel="Essen" unterzeile="Was hast du gegessen? Ein Tag, eine Notiz." />
      <EssenKalender key={monat} monat={monat} heute={heute} notizen={notizen} />
    </div>
  );
}
