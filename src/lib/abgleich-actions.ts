"use server";
import { revalidatePath } from "next/cache";
import { VERSCHOBEN } from "@/lib/abgleich";
import {
  schalteErledigt, setzeGrund, schiebeInVorsatz,
} from "@/lib/supabase/tagesrueckblick-db";
import { heuteISO } from "@/lib/time";

/**
 * Die drei Antworten des Abgleichs.
 *
 * Das Datum kommt immer aus dem Formular, nie aus `new Date()`: der Abgleich
 * arbeitet auf dem Vorsatz von GESTERN, und wer hier heute rechnet, schreibt
 * kurz nach Mitternacht reproduzierbar in die falsche Zeile.
 *
 * Eigene Datei statt `actions.ts`: Next lädt eine `"use server"`-Datei als
 * Ganzes, und `actions.ts` ist mit über hundert Aktionen der grösste Brocken.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function lies(fd: FormData): { datum: string; zeile: string } | null {
  const datum = String(fd.get("datum") ?? "").slice(0, 10);
  const zeile = String(fd.get("zeile") ?? "").trim();
  if (!ISO.test(datum) || !zeile) return null;
  return { datum, zeile };
}

function neuLaden() {
  revalidatePath("/");
  revalidatePath("/rueckblick");
}

/** Haken setzen oder zurücknehmen. Ein gesetzter Haken löscht einen Grund. */
export async function punktErledigt(fd: FormData) {
  const w = lies(fd);
  if (!w) return;
  await schalteErledigt(w.datum, w.zeile);
  await setzeGrund(w.datum, w.zeile, "");
  neuLaden();
}

/**
 * „Nicht geschafft, weil …" — der Grund ist Pflicht.
 *
 * Ohne Text passiert nichts. Ein leeres „nicht" wäre dasselbe wie gar keine
 * Antwort, sähe aber wie eine aus.
 */
export async function punktNicht(fd: FormData) {
  const w = lies(fd);
  const grund = String(fd.get("grund") ?? "").trim();
  if (!w || !grund) return;
  await setzeGrund(w.datum, w.zeile, grund);
  neuLaden();
}

/**
 * Auf morgen schieben.
 *
 * Zwei Schritte, die zusammengehören: der Punkt von gestern wird als
 * verschoben markiert, und dieselbe Zeile landet im Vorsatz von HEUTE — also
 * in dem, was morgen früh wieder auf der Startseite steht.
 */
export async function punktVerschieben(fd: FormData) {
  const w = lies(fd);
  if (!w) return;
  await setzeGrund(w.datum, w.zeile, VERSCHOBEN);
  await schiebeInVorsatz(heuteISO(), w.zeile);
  neuLaden();
}

/**
 * Grund wieder wegnehmen — die Zeile ist dann erneut offen.
 *
 * Den Haken nimmt `punktErledigt` selbst zurück (es ist ein Umschalter);
 * hier geht es nur um „nicht" und „verschoben".
 */
export async function punktZuruecksetzen(fd: FormData) {
  const w = lies(fd);
  if (!w) return;
  await setzeGrund(w.datum, w.zeile, "");
  neuLaden();
}
