import { SeitenKopf } from "@/components/seiten-kopf";
import { RoutinenListe } from "@/components/routinen/liste";
import { RoutinenHeute } from "@/components/routinen/heute";
import { ladeRoutinen } from "@/lib/routinen/laden";
import { heuteISO, heuteWochentag } from "@/lib/time";
import { heuteFaellig } from "@/lib/routinen/typen";

export const dynamic = "force-dynamic";

/**
 * Routinen (26.09.2026): welche Ziele ich habe und was ich dafür tue.
 * Erinnert wird auf der Startseite und per Push-Meldung der App.
 */
export default async function RoutinenPage() {
  const ziele = await ladeRoutinen();
  const tag = heuteWochentag();
  const heute = heuteISO();

  return (
    <div className="py-2">
      <SeitenKopf titel="Routinen"
        unterzeile="Ziele — und was du wirklich dafür tust." />

      {ziele.length > 0 && (
        <div className="mb-5 rounded-2xl border border-accent/25 bg-accent-tint/40 p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-accent-soft">Heute</p>
          <RoutinenHeute ziele={ziele} wochentag={tag} heute={heute} />
          {heuteFaellig(ziele, tag, heute).length === 0 && (
            <p className="text-sm text-ink-muted">Heute steht nichts an.</p>
          )}
        </div>
      )}

      <RoutinenListe ziele={ziele} />

      <p className="mt-6 text-xs text-ink-faint">
        🔔 Mit Uhrzeit kommt die Push-Meldung genau dann, ohne Uhrzeit gesammelt um 07:00 — nur solange nicht abgehakt. Bei „x-mal pro Woche“ täglich, bis die Anzahl erreicht ist.
        Push einschalten: Alarme → Dieses Gerät.
      </p>
    </div>
  );
}
