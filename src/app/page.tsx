import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import type { NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Drei Kacheln. Das ist die ganze Startseite.
 *
 * Seit 21.09.2026 ist „Woche" die dritte: ein kleiner Organizer, in dem
 * Training (Push/Pull/Ausdauer), Essen nach Plan, Gewicht, Wochenziele und
 * die Vorhaben für freie Zeit nur noch angetippt werden. Bewusst schmal —
 * kein Zurück zur Planung mit Projekten, Kalender und Meilensteinen.
 *
 * Am 09.09.2026 hat Kerim KerimOS radikal zusammengestrichen: Gym, die
 * Gewohnheiten, die Planung mit Projekten und Kalender, die
 * Einstellungsseite, der Navigator mit seinen Modi und alles, was daran hing,
 * sind entfernt. Übrig bleiben die zwei Bereiche, die er tatsächlich täglich
 * benutzt — Trading und Essen.
 *
 * Der vollständige Stand von vorher liegt im Tag `vollstand-2026-09-09` und
 * im Branch `backup/vollstand-2026-09-09`. Nichts davon ist verloren, es
 * steht nur nicht mehr im Weg. Die Datenbanktabellen sind ebenfalls
 * unangetastet geblieben.
 *
 * Was hier NICHT mehr steht und auch nicht zurückkommen soll, solange die
 * Seite zwei Kacheln hat: Tagessatz, Wetter, Suche, Kennzahlen auf den
 * Kacheln, aktive Trades. Jede dieser Karten war einzeln vernünftig; zusammen
 * waren sie der Grund, warum die Seite unlesbar wurde.
 */
export default async function Start() {
  const supabase = await createClient();

  /**
   * Die Bilder kommen weiterhin aus `links` — mehr wird von der Tabelle nicht
   * mehr gebraucht.
   *
   * Die Kacheln selbst stehen fest im Code: bei drei Stück ist eine
   * Verwaltungsseite mit Gruppen, Reihenfolge und Symbolen mehr Maschinerie
   * als Inhalt. Das Bild aber hat Kerim selbst gesetzt, und es ist das
   * Einzige, was diese Seite ansehnlich macht — deshalb diese eine Abfrage.
   * Fehlt die Zeile oder das Bild, greift die Farbe darunter.
   */
  const { data } = await supabase.from("links")
    .select("target, image_url, image_position")
    .in("target", ["/trading", "/m/Essen", "/woche"]);

  const bilder = new Map(
    ((data ?? []) as Pick<NavLink, "target" | "image_url" | "image_position">[])
      .map((l) => [l.target, l]),
  );

  const kacheln = [
    { name: "Trading", ziel: "/trading", farbe: "#8B94B8", zeichen: "◈" },
    { name: "Essen", ziel: "/m/Essen", farbe: "#C4A882", zeichen: "▤" },
    { name: "Woche", ziel: "/woche", farbe: "#C68D6B", zeichen: "◷" },
  ];

  return (
    <div className="py-10">
      <Logo inverted className="mb-8 h-11 w-11 rounded-2xl" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {kacheln.map((k, i) => {
          const bild = bilder.get(k.ziel);

          return (
            <Link key={k.ziel} href={k.ziel}
              className="group relative flex aspect-[16/10] animate-pop flex-col justify-end
                         overflow-hidden rounded-2xl border border-line/70 bg-card shadow-tile
                         transition duration-200 ease-tactile
                         hover:-translate-y-1 hover:border-line-strong active:scale-[0.98]"
              style={{
                animationDelay: `${i * 55}ms`,
                boxShadow: `0 14px 28px -18px ${k.farbe}55`,
              }}>
              {bild?.image_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bild.image_url} alt=""
                    style={{ objectPosition: bild.image_position ?? "50% 50%" }}
                    className="absolute inset-0 h-full w-full object-cover transition
                               duration-300 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t
                                  from-black/85 via-black/40 to-black/5" />
                </>
              ) : (
                <div className="absolute inset-0" style={{ background: k.farbe + "26" }}>
                  <span className="absolute right-4 top-3 text-5xl opacity-30"
                    style={{ color: k.farbe }}>
                    {k.zeichen}
                  </span>
                </div>
              )}
              <div className="relative p-5">
                <span className="font-display text-xl font-bold text-white drop-shadow">
                  {k.name}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
