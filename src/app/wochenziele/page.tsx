import Link from "next/link";
import { SeitenKopf } from "@/components/seiten-kopf";
import { WochenzieleListe } from "@/components/wochenziele/liste";
import { ladeWochenziele, aktuelleWoche } from "@/lib/wochenziele/laden";
import { kalenderwoche } from "@/lib/wochenziele/typen";
import { addDays, weekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const kurz = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });

/**
 * Wochenziele (26.09.2026).
 *
 * Bewusst Ziele für die Woche, keine Tagesaufgaben. Eine Woche pro Seite,
 * mit Pfeilen zurück ins Archiv. Unfertiges der Vorwoche steht hier schon
 * drin — als dringend markiert (siehe lib/wochenziele/laden.ts).
 */
export default async function WochenzielePage({
  searchParams,
}: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const aktuell = aktuelleWoche();
  const woche = ISO.test(sp.w ?? "") ? weekStart(sp.w!) : aktuell;
  const ziele = await ladeWochenziele(woche);

  const fertig = ziele.filter((z) => z.status === "fertig").length;

  return (
    <div className="py-2">
      <SeitenKopf
        titel="Wochenziele"
        unterzeile={
          <>
            KW {kalenderwoche(woche)} · {kurz(woche)} – {kurz(addDays(woche, 6))}
            {ziele.length > 0 && <> · {fertig} von {ziele.length} fertig</>}
          </>
        }
        rechts={
          <div className="flex items-center gap-1">
            <Link href={`/wochenziele?w=${addDays(woche, -7)}`}
              className="rounded-lg bg-sand px-3 py-1.5 text-sm text-ink-soft hover:text-ink">←</Link>
            {woche !== aktuell && (
              <Link href="/wochenziele"
                className="rounded-lg bg-sand px-3 py-1.5 text-xs text-accent-soft">Diese Woche</Link>
            )}
            <Link href={`/wochenziele?w=${addDays(woche, 7)}`}
              className="rounded-lg bg-sand px-3 py-1.5 text-sm text-ink-soft hover:text-ink">→</Link>
          </div>
        }
      />
      <WochenzieleListe ziele={ziele} woche={woche} />
    </div>
  );
}
