import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Die Oberflächen-Einstellungen: Hausfarbe und Hintergrund.
 *
 * **Warum eine Auswahl und kein Farbwähler.** Der Akzent trägt schwarzen Text
 * (Knöpfe, aktive Reiter). Ein frei gewählter dunkler Ton macht diese
 * Beschriftungen unlesbar, und zwar erst auf der nächsten Seite, wo man es
 * nicht mehr mit der Wahl verbindet. Acht geprüfte Töne, die alle hell genug
 * sind, lösen das Problem, statt es abzufangen — und passen ausserdem zum
 * warmen Grund, was ein beliebiger Farbwähler nicht garantiert.
 *
 * **Warum nicht mehr Einstellungen.** Schriftgrösse, Eckenradius, Dichte —
 * alles verlockend und alles Wege, die Oberfläche kaputtzustellen. Was hier
 * fehlt, fehlt mit Absicht.
 */

export interface Oberflaeche {
  akzent: string;
  /** Der driftende Farbnebel hinter allem. Kostet auf schwachen Geräten Bildrate. */
  ambient: boolean;
}

export const STANDARD_OBERFLAECHE: Oberflaeche = {
  akzent: "#E7A96B",
  ambient: true,
};

/** Die geprüften Töne. Alle hell genug für dunklen Text darauf. */
export const AKZENTE = [
  { wert: "#E7A96B", name: "Bernstein" },
  { wert: "#5FC2A6", name: "Salbei" },
  { wert: "#6FA3D8", name: "Himmel" },
  { wert: "#E28B72", name: "Terrakotta" },
  { wert: "#ACB56E", name: "Olive" },
  { wert: "#A38EDD", name: "Flieder" },
  { wert: "#D9A5C4", name: "Malve" },
  { wert: "#D8C77E", name: "Messing" },
] as const;

/**
 * Eine Farbe aufhellen oder abdunkeln — für die `soft`- und `tint`-Stufen.
 *
 * @param anteil positiv = heller, negativ = dunkler, 0…1
 */
function mischen(hex: string, anteil: number): string {
  const roh = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(roh)) return hex;

  const kanal = (i: number) => {
    const wert = parseInt(roh.slice(i * 2, i * 2 + 2), 16);
    const ziel = anteil > 0 ? 255 : 0;
    const neu = Math.round(wert + (ziel - wert) * Math.abs(anteil));
    return Math.min(255, Math.max(0, neu)).toString(16).padStart(2, "0");
  };
  return `#${kanal(0)}${kanal(1)}${kanal(2)}`;
}

/** Für den Schein unter Knöpfen: `rgba(r, g, b, …)`. */
function zuRgb(hex: string): string {
  const roh = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(roh)) return "231,169,107";
  return [0, 1, 2].map((i) => parseInt(roh.slice(i * 2, i * 2 + 2), 16)).join(",");
}

/**
 * Die CSS-Variablen, die der Akzent setzt.
 *
 * Tailwind zeigt für `accent` auf diese Variablen (siehe tailwind.config.ts),
 * deshalb genügt es, sie einmal am `<html>` zu setzen — jede Klasse im ganzen
 * Projekt zieht nach, ohne dass irgendwo eine Farbe doppelt gepflegt wird.
 */
export function akzentVariablen(akzent: string): Record<string, string> {
  return {
    "--akzent": akzent,
    "--akzent-soft": mischen(akzent, 0.22),
    "--akzent-tint": mischen(akzent, -0.78),
    "--akzent-rgb": zuRgb(akzent),
  };
}

/**
 * Was der Nutzer eingestellt hat — oder die Vorgabe.
 *
 * Fehlt die Tabelle (Migration 21 noch nicht gelaufen) oder die Zeile, gilt
 * still der Standard. Ein Fehler wäre hier das falsche Verhalten: die App
 * soll auch ohne Einstellungen laufen, und zwar so wie bisher.
 */
export async function ladeOberflaeche(): Promise<Oberflaeche> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings").select("akzent, ambient").maybeSingle();

  if (error || !data) return STANDARD_OBERFLAECHE;

  const zeile = data as unknown as Record<string, unknown>;
  const akzent = String(zeile.akzent ?? STANDARD_OBERFLAECHE.akzent);

  return {
    // Ein Wert, den niemand mehr auswählen kann (etwa aus einer alten
    // Version), darf die Oberfläche nicht in einen unlesbaren Zustand
    // bringen — dann lieber zurück auf Bernstein.
    akzent: /^#[0-9a-f]{6}$/i.test(akzent) ? akzent : STANDARD_OBERFLAECHE.akzent,
    ambient: zeile.ambient !== false,
  };
}
