"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BRETT_BILD } from "@/lib/start/kacheln";

/**
 * Der Empfang beim Öffnen des Kompass.
 *
 * Kerims Wunsch vom 26.09.2026: „ich möchte, dass man, wenn man den Kompass
 * startet, mit der Scroll-Animation beginnt. Es heisst mich herzlich
 * willkommen oder sagt mir etwas, was wichtig ist."
 *
 * Wie es sich anfühlt: die Collage liegt unscharf und zu nah vor einem, der
 * Gruss steht darin. Man scrollt — und statt dass die Seite wegrutscht,
 * fährt das Bild zurück und wird scharf, der Gruss verschwindet, der wichtige
 * Satz kommt. Am Ende gibt die Animation die Seite frei und das Brett steht
 * da. Rückwärts geht es genauso, solange man nicht durch ist.
 *
 * ─── Warum die Seite dabei wirklich festgehalten wird ───
 *
 * `overflow: hidden` auf dem Body allein reicht nicht: iOS scrollt trotzdem,
 * und der Gummiband-Effekt schiebt die Seite unter der Animation weg.
 * Verlässlich ist nur `position: fixed` mit gemerkter Scrollposition — die
 * Technik, die auch Dialog-Bibliotheken verwenden. Beim Freigeben wird die
 * Position wiederhergestellt, sonst springt man nach oben.
 *
 * ─── Warum nur einmal pro Sitzung ───
 *
 * Ein Empfang, den man bei jeder Rückkehr auf „/" wieder wegscrollen muss,
 * ist kein Empfang, sondern eine Tür, die klemmt. `sessionStorage` heisst:
 * einmal beim Starten, danach nicht mehr — bis der Tab geschlossen wird.
 * Wer die Bewegung abgeschaltet hat (`prefers-reduced-motion`), sieht sie
 * nie; der Gruss steht dann trotzdem über dem Brett.
 */

const SCHLUESSEL = "kompass-empfang";
/** Scroll-Weg in Pixeln für den ganzen Ablauf. */
const WEG = 1400;

export interface WillkommenProps {
  gruss: string;
  satz: string;
  ziel: string | null;
  zielText: string | null;
  datum: string;
}

const klemme = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function Willkommen(p: WillkommenProps) {
  const [phase, setPhase] = useState<"pruefen" | "laeuft" | "geht" | "weg">("pruefen");
  const huelleRef = useRef<HTMLDivElement>(null);
  const bildRef = useRef<HTMLDivElement>(null);
  const grussRef = useRef<HTMLDivElement>(null);
  const satzRef = useRef<HTMLDivElement>(null);
  const hinweisRef = useRef<HTMLDivElement>(null);
  const balkenRef = useRef<HTMLDivElement>(null);
  const zielFortschritt = useRef(0);
  const fertig = useRef(false);

  // Entscheiden, ob der Empfang überhaupt läuft. Erst im Effekt, weil
  // sessionStorage auf dem Server nicht existiert.
  useEffect(() => {
    const wenigerBewegung =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let gesehen = false;
    try { gesehen = sessionStorage.getItem(SCHLUESSEL) === "1"; } catch { /* privater Modus */ }
    setPhase(gesehen || wenigerBewegung ? "weg" : "laeuft");
  }, []);

  useEffect(() => {
    if (phase !== "laeuft") return;

    /* ---------------------------------------------------- Seite festhalten */
    const gemerkt = window.scrollY;
    const b = document.body.style;
    const vorher = {
      position: b.position, top: b.top, left: b.left, right: b.right,
      width: b.width, overscrollBehavior: b.overscrollBehavior,
    };
    b.position = "fixed";
    b.top = `-${gemerkt}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    b.overscrollBehavior = "none";

    const freigeben = () => {
      Object.assign(b, vorher);
      window.scrollTo(0, gemerkt);
    };

    /* ----------------------------------------------------------- Eingaben */
    let jetzt = 0;
    let letzteBeruehrung = 0;

    const schieben = (delta: number) => {
      zielFortschritt.current = klemme(zielFortschritt.current + delta / WEG, 0, 1);
    };

    const aufRad = (e: WheelEvent) => { schieben(e.deltaY); e.preventDefault(); };
    const aufStart = (e: TouchEvent) => { letzteBeruehrung = e.touches[0]?.clientY ?? 0; };
    const aufZug = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? letzteBeruehrung;
      schieben((letzteBeruehrung - y) * 2.2);
      letzteBeruehrung = y;
      e.preventDefault();
    };
    const aufTaste = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { schieben(320); e.preventDefault(); }
      if (["ArrowUp", "PageUp"].includes(e.key)) { schieben(-320); e.preventDefault(); }
      if (e.key === "Escape") { zielFortschritt.current = 1; }
    };

    window.addEventListener("wheel", aufRad, { passive: false });
    window.addEventListener("touchstart", aufStart, { passive: true });
    window.addEventListener("touchmove", aufZug, { passive: false });
    window.addEventListener("keydown", aufTaste);

    /* ------------------------------------------------------------- Bild */
    let raf = 0;
    const schritt = () => {
      jetzt += (zielFortschritt.current - jetzt) * 0.14;
      const f = jetzt;

      if (bildRef.current) {
        bildRef.current.style.transform = `scale(${1.32 - f * 0.32})`;
        bildRef.current.style.filter = `blur(${(1 - f) * 16}px) saturate(${0.7 + f * 0.5})`;
        bildRef.current.style.opacity = String(0.45 + f * 0.55);
      }
      if (grussRef.current) {
        // Der Gruss ist zuerst da und geht als Erstes wieder — er hat seine
        // Arbeit getan, sobald man ihn gelesen hat.
        const t = 1 - klemme((f - 0.05) / 0.4, 0, 1);
        grussRef.current.style.opacity = String(t);
        grussRef.current.style.transform = `translateY(${(1 - t) * -26}px) scale(${0.97 + t * 0.03})`;
        grussRef.current.style.filter = `blur(${(1 - t) * 9}px)`;
      }
      if (satzRef.current) {
        const t = klemme((f - 0.42) / 0.3, 0, 1);
        satzRef.current.style.opacity = String(t);
        satzRef.current.style.transform = `translateY(${(1 - t) * 22}px)`;
        satzRef.current.style.filter = `blur(${(1 - t) * 7}px)`;
      }
      if (hinweisRef.current) {
        hinweisRef.current.style.opacity = String(klemme(1 - f * 4, 0, 1));
      }
      if (balkenRef.current) balkenRef.current.style.transform = `scaleX(${f})`;

      // Erst wenn die Animation tatsächlich AM Ende ist, nicht schon wenn die
      // Eingabe dort ankommt — sonst reisst das Bild im letzten Zehntel ab.
      if (!fertig.current && zielFortschritt.current >= 1 && f > 0.985) {
        fertig.current = true;
        try { sessionStorage.setItem(SCHLUESSEL, "1"); } catch { /* egal */ }
        freigeben();
        setPhase("geht");
        window.setTimeout(() => setPhase("weg"), 620);
      }

      raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", aufRad);
      window.removeEventListener("touchstart", aufStart);
      window.removeEventListener("touchmove", aufZug);
      window.removeEventListener("keydown", aufTaste);
      freigeben();
    };
  }, [phase]);

  if (phase === "pruefen" || phase === "weg") return null;

  return (
    <div
      ref={huelleRef}
      className="fixed inset-0 z-50 overflow-hidden bg-[#0B0907]
                 transition-opacity duration-[600ms] ease-out"
      style={{ touchAction: "none", opacity: phase === "geht" ? 0 : 1 }}
      aria-live="polite"
    >
      <div
        ref={bildRef}
        aria-hidden
        className="absolute inset-0 bg-cover bg-center will-change-transform"
        style={{ backgroundImage: `url(${BRETT_BILD})`, transform: "scale(1.32)", opacity: 0.45 }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b
                                  from-black/75 via-black/45 to-black/85" />

      <div ref={grussRef} className="absolute inset-0 flex flex-col items-center
                                     justify-center px-8 text-center">
        <span className="font-display text-[clamp(28px,6vw,68px)] font-bold leading-[1.05]
                         tracking-tight text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
          {p.gruss}
        </span>
        <span className="mt-3 text-[clamp(11px,1.5vw,14px)] uppercase tracking-[0.3em]
                         text-white/55">
          {p.datum}
        </span>
      </div>

      <div ref={satzRef} className="absolute inset-0 flex flex-col items-center
                                    justify-center px-8 text-center opacity-0">
        <span className="max-w-2xl font-display text-[clamp(19px,3.2vw,38px)] font-bold
                         leading-snug text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
          {p.satz}
        </span>
        {p.ziel && p.zielText && (
          <Link href={p.ziel}
            onClick={() => { zielFortschritt.current = 1; }}
            className="mt-6 rounded-xl border border-white/30 bg-white/10 px-5 py-2
                       text-sm font-medium text-white backdrop-blur
                       transition hover:border-white/70 hover:bg-white/20">
            {p.zielText} →
          </Link>
        )}
      </div>

      <div ref={hinweisRef}
        className="pointer-events-none absolute bottom-[clamp(28px,7vh,64px)] left-1/2
                   flex -translate-x-1/2 flex-col items-center gap-2
                   text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
        <span>Scrollen</span>
        <svg width="14" height="18" viewBox="0 0 14 18" className="animate-bounce">
          <path d="M7 1 L7 17 M2 12 L7 17 L12 12" stroke="currentColor" strokeWidth="1.5"
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <button
        type="button"
        onClick={() => { zielFortschritt.current = 1; }}
        className="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-xs text-white/50
                   transition hover:bg-white/10 hover:text-white"
      >
        überspringen
      </button>

      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
        <div ref={balkenRef}
          className="h-full w-full origin-left bg-gradient-to-r from-white/40 to-white"
          style={{ transform: "scaleX(0)" }} />
      </div>
    </div>
  );
}
