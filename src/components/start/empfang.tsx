import Link from "next/link";

/**
 * Der Empfang der Startseite nach Design D „Fokus mit Brett“ (07.10.2026).
 *
 * Kerims Collage liegt als ganzer Hintergrund darunter — abgedunkelt, damit
 * die Schrift trägt, und mit einem sehr langsamen Zoom, damit das Bild lebt.
 * Davor in der ruhigen Typografie von B: der Wochentag, der Gruss und der
 * EINE Satz, der heute zählt (lib/start/begruessung.ts). Rechts eine Karte
 * mit dem, was man beim Reinkommen wissen will: Termin, Wetter, Routinen.
 *
 * Ersetzt den Scroll-Empfang (willkommen.tsx), der die Seite beim Öffnen
 * festhielt. Kein Scroll-Kapern mehr: man sieht alles sofort, scrollt man,
 * kommt das Brett.
 *
 * Reine Server-Komponente: die Bewegung ist CSS (Tailwind-Animationen aus
 * tailwind.config.ts) und fällt bei `prefers-reduced-motion` weg.
 */

export interface EmpfangProps {
  wochentag: string;
  datum: string;
  gruss: string;
  satz: string;
  ziel: string | null;
  zielText: string | null;
  spruch: string | null;
  wetter: { temperatur: string; text: string; regen: string } | null;
  termin: { zeit: string; titel: string; waehrung: string | null; vorbei: boolean } | null;
  weitereTermine: number;
  routinen: { erledigt: number; gesamt: number };
  hits: number;
  laufende: number;
  ziele: { fertig: number; gesamt: number };
}

const PFEIL = "M5 12h14M13 6l6 6-6 6";

export function Empfang(p: EmpfangProps) {
  const pct = p.routinen.gesamt === 0 ? 0 : Math.round((p.routinen.erledigt / p.routinen.gesamt) * 100);
  return (
    <section className="relative isolate mx-[calc(50%-50vw)] -mt-6 w-screen overflow-hidden bg-[#0B0C0F] text-photo">
      <div aria-hidden className="kt-bild absolute inset-[-3%] -z-20 animate-kenburns bg-cover"
        style={{ backgroundPosition: "50% 38%" }} />
      <div aria-hidden className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(9,10,12,.9) 0%, rgba(9,10,12,.7) 42%, rgba(9,10,12,.3) 100%),"
            + "linear-gradient(0deg, rgba(9,10,12,.92) 0%, rgba(9,10,12,0) 55%)",
        }} />

      <div className="mx-auto grid min-h-[600px] max-w-6xl items-end gap-8 px-4 pb-8 pt-24
                      lg:min-h-[680px] lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-10">
        <div>
          <div className="text-sm text-photo/75">{p.datum}</div>
          <h1 className="mt-1 overflow-hidden pb-1 font-display text-[64px] font-extrabold leading-[.92]
                         tracking-tight sm:text-[96px] lg:text-[112px]">
            <span className="block animate-lineup">{p.wochentag}</span>
          </h1>
          <p className="mt-6 text-[15px] font-semibold text-photo/70">{p.gruss}</p>
          <p className="mt-1.5 max-w-[24ch] overflow-hidden font-display text-[26px] font-medium leading-[1.15]
                        tracking-tight sm:text-[34px]">
            <span className="block animate-lineup [animation-delay:120ms]">{p.satz}</span>
          </p>
          {p.spruch && <p className="mt-3 max-w-[54ch] text-photo/75">„{p.spruch}“</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {p.ziel && p.zielText && (
              <Link href={p.ziel}
                className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-photo px-6 font-semibold
                           text-[#111214] transition duration-200 ease-tactile hover:-translate-y-px active:scale-[0.97]">
                {p.zielText}
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PFEIL} /></svg>
              </Link>
            )}
            <Link href="/trading/fundamentals"
              className="inline-flex min-h-[52px] items-center rounded-full border border-white/35 px-5 font-semibold
                         transition duration-200 hover:border-white/70 active:scale-[0.97]">
              Makro-Lage
            </Link>
          </div>
        </div>

        <div className="kt-glas flex animate-rise flex-col gap-5 rounded-[22px] p-5 [animation-delay:350ms]">
          <div>
            <div className="text-[13px] text-photo/65">
              {p.termin ? (p.termin.vorbei ? `Heute, ${p.termin.zeit} (vorbei)` : `Heute, ${p.termin.zeit} Zürich`) : "Heute im Kalender"}
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="font-display text-[22px] font-semibold leading-tight tracking-tight">
                {p.termin ? p.termin.titel : "Keine wichtigen Termine"}
              </span>
              {p.termin?.waehrung && <span className="text-[13px] text-photo/65">{p.termin.waehrung}</span>}
            </div>
            {p.weitereTermine > 0 && (
              <div className="mt-1 text-[13px] text-photo/65">und {p.weitereTermine} weitere heute</div>
            )}
          </div>
          {p.wetter && (
            <div>
              <div className="text-[13px] text-photo/65">Wetter</div>
              <div className="mt-0.5 flex items-baseline gap-3">
                <span className="font-display text-[22px] font-semibold">{p.wetter.temperatur}</span>
                <span className="text-sm text-photo/80">{p.wetter.text}</span>
              </div>
              <div className="mt-0.5 text-[13px] text-photo/65">{p.wetter.regen}</div>
            </div>
          )}
          <Link href="/routinen" className="flex items-center justify-between gap-3 rounded-2xl transition hover:opacity-90">
            <div>
              <div className="text-[13px] text-photo/65">Routinen heute</div>
              <div className="font-display text-[22px] font-semibold">{p.routinen.erledigt} von {p.routinen.gesamt}</div>
            </div>
            <svg viewBox="0 0 54 54" className="h-[54px] w-[54px] -rotate-90" aria-hidden>
              <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={5} />
              <circle cx="27" cy="27" r="22" fill="none" stroke="#AFC0FF" strokeWidth={5} strokeLinecap="round"
                pathLength={100} strokeDasharray={`${pct} 100`}
                className="transition-[stroke-dasharray] duration-700 ease-tactile" />
            </svg>
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-3 border-t border-white/15 px-4 pb-8">
        {[
          { v: String(p.hits), l: p.hits === 1 ? "offener Hit" : "offene Hits", href: "/trading" },
          { v: String(p.laufende), l: p.laufende === 1 ? "laufender Trade" : "laufende Trades", href: "/trading/journal" },
          { v: `${p.ziele.fertig}/${p.ziele.gesamt}`, l: "Wochenziele fertig", href: "/wochenziele" },
        ].map((s, i) => (
          <Link key={s.l} href={s.href}
            className={`animate-rise pt-4 ${i > 0 ? "border-l border-white/15 pl-3 sm:pl-5" : ""} transition hover:opacity-85`}
            style={{ animationDelay: `${450 + i * 80}ms` }}>
            <div className="tabular font-display text-[30px] font-semibold leading-none sm:text-[44px]">{s.v}</div>
            <div className="mt-1.5 text-[13px] text-photo/70 sm:text-sm">{s.l}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
