"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { GERUEST, MUSKELN, ansichtName } from "@/lib/koerper-teile";
import { rampe, alsZahl } from "@/lib/muskel-analyse";

/**
 * Der drehbare Körper.
 *
 * three.js wird **erst im Browser und erst auf dieser Seite** geladen
 * (`await import`). Es sind 670 KB — die haben im Bündel jeder anderen Seite
 * nichts verloren, und auf dem Handy im Zug schon gar nicht.
 *
 * Der Körper besteht aus Grundformen, eine Gruppe von Bäuchen je Muskel
 * (`lib/koerper-teile.ts`). Ein gekauftes Anatomiemodell wäre schöner und
 * ist genau deshalb schwierig: dort ist der ganze Körper meist EIN Netz, und
 * dann lässt sich nichts einzeln anklicken oder einfärben. Wird eines
 * eingebaut, ändert sich nur diese Datei — die Daten, die Farben und das
 * Antippen bleiben.
 */
export function Koerper3D({ werte, gewaehlt, onWaehle }: {
  /** Muskelgruppe → Sätze pro Woche. */
  werte: Record<string, number>;
  gewaehlt: string | null;
  onWaehle: (gruppe: string) => void;
}) {
  const huelle = useRef<HTMLDivElement>(null);
  const stoffe = useRef<Record<string, T.MeshStandardMaterial>>({});
  const ziel = useRef({ x: 0, y: 0 });
  const [ansicht, setAnsicht] = useState("Vorne");
  const [bereit, setBereit] = useState(false);
  const [fehler, setFehler] = useState(false);

  // Die Szene wird einmal gebaut, der Klick-Empfänger ändert sich bei jedem
  // Rendern. Über ein Ref bleibt der Griff aktuell, ohne die Szene anzufassen
  // — sonst tippt man auf einen Muskel und es passiert, was beim ersten
  // Rendern richtig gewesen wäre.
  const waehleRef = useRef(onWaehle);
  waehleRef.current = onWaehle;

  // Ohne Abhängigkeiten: die Szene wird EINMAL gebaut. Alles, was sich
  // ändert, ist eine Materialfarbe — dafür die Szene neu aufzubauen wäre
  // ein Neustart bei jedem Klick, samt verlorener Drehung.
  useEffect(() => {
    let lebt = true;
    let aufraeumen = () => {};

    (async () => {
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        if (lebt) setFehler(true);
        return;
      }
      const halter = huelle.current;
      if (!lebt || !halter) return;

      const szene = new THREE.Scene();
      const kamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      kamera.position.set(0, 0.92, 3.05);
      kamera.lookAt(0, 0.88, 0);

      let maler: T.WebGLRenderer;
      try {
        maler = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        // Kein WebGL — kommt auf alten Geräten und in manchen In-App-Browsern
        // vor. Dann bleibt die Liste darunter, und die trägt die Aussage
        // ohnehin allein.
        if (lebt) setFehler(true);
        return;
      }
      maler.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      halter.appendChild(maler.domElement);

      szene.add(new THREE.HemisphereLight(0xF5EFE3, 0x17130F, 0.5));
      const sonne = new THREE.DirectionalLight(0xFFE7C8, 1.05);
      sonne.position.set(2.0, 3.0, 3.0); szene.add(sonne);
      const gegen = new THREE.DirectionalLight(0x9BB4DE, 0.4);
      gegen.position.set(-2.6, 1.0, -2.4); szene.add(gegen);
      const kante = new THREE.DirectionalLight(0xFFD9AE, 0.3);
      kante.position.set(0, 1.5, -3.2); szene.add(kante);

      const koerper = new THREE.Group();
      szene.add(koerper);

      const kugel = new THREE.SphereGeometry(1, 28, 20);
      const grund = new THREE.MeshStandardMaterial({ color: 0x4A4036, roughness: 0.95 });
      const sehne = new THREE.MeshStandardMaterial({ color: 0x5A4E40, roughness: 0.85 });

      function setze(mat: T.Material, t: { s: number[]; p: number[]; r?: number[] }) {
        const m = new THREE.Mesh(kugel, mat);
        m.scale.set(t.s[0], t.s[1], t.s[2]);
        m.position.set(t.p[0], t.p[1], t.p[2]);
        if (t.r) m.rotation.set(t.r[0], t.r[1], t.r[2]);
        koerper.add(m);
        return m;
      }

      for (const t of GERUEST) setze(t.stoff === "sehne" ? sehne : grund, t);

      const eigene: T.MeshStandardMaterial[] = [];
      for (const [gruppe, teile] of Object.entries(MUSKELN)) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x6B4A27, roughness: 0.55, metalness: 0.06,
        });
        stoffe.current[gruppe] = mat;
        eigene.push(mat);
        for (const t of teile) setze(mat, t).userData.key = gruppe;
      }

      function groesse() {
        const b = halter!.clientWidth, h = halter!.clientHeight;
        if (!b || !h) return;
        kamera.aspect = b / h; kamera.updateProjectionMatrix();
        maler.setSize(b, h);
      }
      groesse();
      const beobachter = new ResizeObserver(groesse);
      beobachter.observe(halter);

      /* --------------------------------------------------- Drehen & Klicken */
      let drehX = 0, drehY = 0;
      let zieht = false, letzteX = 0, letzteY = 0, weg = 0;

      const runter = (e: PointerEvent) => {
        // Die Knöpfe liegen IN der Fläche. Ohne diese Zeile schluckt
        // setPointerCapture ihren Klick und „Vorne/Hinten" tut nichts —
        // ein Fehler, den man nur beim echten Anklicken sieht.
        if ((e.target as HTMLElement).closest("[data-knopf]")) return;
        zieht = true; weg = 0; letzteX = e.clientX; letzteY = e.clientY;
        halter!.setPointerCapture(e.pointerId);
      };
      const bewegen = (e: PointerEvent) => {
        if (!zieht) return;
        const dx = e.clientX - letzteX, dy = e.clientY - letzteY;
        letzteX = e.clientX; letzteY = e.clientY;
        weg += Math.abs(dx) + Math.abs(dy);
        ziel.current.y += dx * 0.0095;
        // Begrenzt: ein Körper, der sich überschlägt, ist hübsch, und danach
        // weiss niemand mehr, wo vorne ist.
        ziel.current.x = Math.max(-0.45, Math.min(0.45, ziel.current.x + dy * 0.006));
      };
      const strahl = new THREE.Raycaster();
      const stelle = new THREE.Vector2();
      const hoch = (e: PointerEvent) => {
        if (!zieht) return;
        zieht = false;
        if (weg >= 6) return;             // gedreht, nicht getippt
        const r = halter!.getBoundingClientRect();
        stelle.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        stelle.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        strahl.setFromCamera(stelle, kamera);
        for (const t of strahl.intersectObjects(koerper.children, false)) {
          const k = t.object.userData.key as string | undefined;
          if (k) { waehleRef.current(k); return; }
        }
      };

      halter.addEventListener("pointerdown", runter);
      halter.addEventListener("pointermove", bewegen);
      window.addEventListener("pointerup", hoch);

      let laeuft = 0;
      let letzterName = "";
      const schleife = () => {
        // Weiches Nachziehen: die Knöpfe drehen den Körper sichtbar dorthin,
        // statt ihn umzuschalten. Sonst verliert man die Orientierung.
        drehY += (ziel.current.y - drehY) * 0.14;
        drehX += (ziel.current.x - drehX) * 0.14;
        koerper.rotation.y = drehY;
        koerper.rotation.x = drehX;

        const n = ansichtName(drehY);
        if (n !== letzterName) { letzterName = n; setAnsicht(n); }

        maler.render(szene, kamera);
        laeuft = requestAnimationFrame(schleife);
      };
      schleife();
      setBereit(true);

      aufraeumen = () => {
        cancelAnimationFrame(laeuft);
        beobachter.disconnect();
        halter.removeEventListener("pointerdown", runter);
        halter.removeEventListener("pointermove", bewegen);
        window.removeEventListener("pointerup", hoch);
        // Ohne dispose behält der Browser die Grafikpuffer, und jeder Wechsel
        // auf diese Seite legt einen neuen an.
        kugel.dispose(); grund.dispose(); sehne.dispose();
        eigene.forEach((m) => m.dispose());
        maler.dispose();
        maler.domElement.remove();
        stoffe.current = {};
      };
    })();

    return () => { lebt = false; aufraeumen(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Einfärben — läuft bei jeder Änderung von Zeitraum, Auswahl oder Schalter.
  useEffect(() => {
    for (const [gruppe, mat] of Object.entries(stoffe.current)) {
      mat.color.setHex(alsZahl(rampe(werte[gruppe] ?? 0)));
      const an = gruppe === gewaehlt;
      mat.emissive.setHex(an ? 0x4A3418 : 0x000000);
      mat.emissiveIntensity = an ? 1 : 0;
    }
  }, [werte, gewaehlt, bereit]);

  if (fehler) return null;

  return (
    <div ref={huelle}
      className="relative h-[420px] cursor-grab touch-none overflow-hidden rounded-2xl
                 border border-line bg-[radial-gradient(120%_90%_at_50%_12%,#221B14_0%,#17130F_72%)]
                 active:cursor-grabbing">
      <span className="pointer-events-none absolute right-3 top-3 text-[11px]
                       uppercase tracking-[0.08em] text-ink-faint">
        {ansicht}
      </span>
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        {[["Vorne", 0], ["Hinten", 180], ["Seite", -90]].map(([wort, grad]) => (
          <button key={wort as string} data-knopf
            onClick={() => { ziel.current.y = (grad as number) * Math.PI / 180; ziel.current.x = 0; }}
            className="rounded-lg border border-line-strong bg-card/85 px-2.5 py-1
                       text-xs text-ink-soft backdrop-blur transition
                       hover:border-accent-deep hover:text-ink">
            {wort as string}
          </button>
        ))}
      </div>
    </div>
  );
}
