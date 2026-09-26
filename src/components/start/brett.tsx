"use client";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/ui";
import {
  KACHELN, BRETT_VERHAELTNIS, ausschnitt, ausschnittMobil, type Kachel,
} from "@/lib/start/kacheln";

/**
 * Das Brett — die Collage als Startseite.
 *
 * Jede Kachel zeigt einen Ausschnitt EINES Bildes. Zusammen ergeben sie
 * wieder die Collage, nur mit Fugen dazwischen und einem Rahmen drumherum,
 * damit man sieht, dass es Knöpfe sind und keine Deko.
 *
 * Zwei Fassungen, bewusst nicht eine:
 *
 *   ab md   Das Brett im Bildformat der Collage. Die Ausschnitte sitzen an
 *           ihrem echten Platz, das Bild bleibt als Bild erkennbar.
 *   darunter  Zweispaltige Liste. Ein 5:4-Brett mit dreizehn Feldern wäre
 *           auf einem Handy dreizehn Briefmarken — lesbar ist wichtiger als
 *           hübsch.
 *
 * Kein `transform` auf der Kachel selbst beim Überfahren: das Bild darin
 * würde mitwandern und die Fuge zur Nachbarkachel aufreissen. Stattdessen
 * bewegt sich nur die Bildebene INNEN.
 */

export function Brett() {
  return (
    <>
      {/* Die Breite ist an die HÖHE gekoppelt, nicht an den Textcontainer:
          bei 5:4 entscheidet der kürzere Weg, wie gross das Brett werden
          darf. 110vh mal 0.8 sind 88vh Höhe — es füllt den Bildschirm, ohne
          dass man scrollen muss, um die untere Reihe zu sehen. */}
      <div
        className="relative mx-auto hidden md:block"
        style={{ width: "min(100%, 110vh)", aspectRatio: BRETT_VERHAELTNIS }}
      >
        {KACHELN.map((k) => (
          <div key={k.id} className="absolute p-[3px]"
            style={{ left: `${k.x}%`, top: `${k.y}%`, width: `${k.w}%`, height: `${k.h}%` }}>
            <Feld k={k} bild={ausschnitt(k)} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:hidden">
        {KACHELN.filter((k) => k.art !== "frei").map((k) => (
          <div key={k.id} className="aspect-[4/3]">
            <Feld k={k} bild={ausschnittMobil(k)} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Ein Feld */

function Feld({ k, bild }: { k: Kachel; bild: React.CSSProperties }) {
  if (k.art === "frei") return <Frei k={k} bild={bild} />;
  if (k.art === "app") return <AppFeld k={k} bild={bild} />;

  const inhalt = <Inneres k={k} bild={bild} />;

  return k.art === "extern" ? (
    <a href={k.ziel} target="_blank" rel="noopener noreferrer" className={RAHMEN}>
      {inhalt}
    </a>
  ) : (
    <Link href={k.ziel} className={RAHMEN}>{inhalt}</Link>
  );
}

const RAHMEN =
  "group relative block h-full w-full overflow-hidden rounded-xl border border-white/15 "
  + "shadow-tile outline-none transition duration-200 "
  + "hover:border-white/60 focus-visible:border-white/80 "
  + "focus-visible:ring-2 focus-visible:ring-white/50 active:border-white/70";

function Inneres({ k, bild }: { k: Kachel; bild: React.CSSProperties }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-[450ms] ease-tactile
                   group-hover:scale-[1.06]"
        style={bild}
      />
      {/* Ohne diesen Verlauf ist die Schrift auf hellen Ausschnitten (Rolex,
          weisser G, Schnee) schlicht nicht lesbar. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t
                                  from-black/85 via-black/25 to-black/5
                                  transition-opacity duration-200 group-hover:from-black/70" />
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
        <span className="block font-display text-[13px] font-bold leading-tight text-white
                         drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-[15px]">
          {k.name}
        </span>
        <span className="mt-0.5 block text-[10px] leading-tight text-white/70
                         drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-[11px]">
          {k.unterzeile}
        </span>
      </div>
      {k.art === "extern" && <Ecke zeichen="↗" />}
      {k.art === "app" && <Ecke zeichen="⌘" />}
    </>
  );
}

/** Kleines Zeichen oben rechts: dieses Feld verlässt KerimOS. */
function Ecke({ zeichen }: { zeichen: string }) {
  return (
    <span aria-hidden
      className="absolute right-2 top-1.5 text-[11px] text-white/55
                 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] transition group-hover:text-white/90">
      {zeichen}
    </span>
  );
}

function Frei({ k, bild }: { k: Kachel; bild: React.CSSProperties }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl
                    border border-dashed border-white/20">
      <div aria-hidden className="absolute inset-0 opacity-30 grayscale" style={bild} />
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <span className="block text-[11px] font-medium text-white/55">{k.name}</span>
        <span className="mt-0.5 block text-[10px] leading-tight text-white/35">
          {k.unterzeile}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------- Lokal installierte App */

/**
 * Ein Feld, das eine Anwendung auf dem Rechner öffnet.
 *
 * TradingView registriert beim Installieren das Protokoll `tradingview://`.
 * Ob es wirklich da ist, kann eine Webseite nicht abfragen — es gibt keine
 * Schnittstelle dafür, und das ist Absicht (sonst könnte jede Seite die
 * installierte Software auslesen). Also: Protokoll aufrufen und schauen, ob
 * der Browser den Fokus verliert. Bleibt die Seite nach 1.2 Sekunden im
 * Vordergrund, war nichts da, und die Webfassung übernimmt.
 *
 * Der Fehlerfall ist damit ein zweiter Tab, nicht eine tote Kachel.
 */
function AppFeld({ k, bild }: { k: Kachel; bild: React.CSSProperties }) {
  const [warte, setWarte] = useState(false);

  const oeffnen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (warte) return;
    setWarte(true);

    let weg = false;
    const merken = () => { if (document.hidden) weg = true; };
    document.addEventListener("visibilitychange", merken);
    window.addEventListener("blur", merken);

    window.location.href = k.ziel;

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", merken);
      window.removeEventListener("blur", merken);
      setWarte(false);
      if (!weg && !document.hidden && k.ersatz) {
        window.open(k.ersatz, "_blank", "noopener,noreferrer");
      }
    }, 1200);
  };

  return (
    <a href={k.ersatz ?? k.ziel} onClick={oeffnen} className={RAHMEN}>
      <Inneres k={k} bild={bild} />
      {warte && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55
                         text-[11px] font-medium text-white/80">
          öffnet …
        </span>
      )}
    </a>
  );
}
