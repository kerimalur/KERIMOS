"use server";
import { revalidatePath } from "next/cache";
import {
  loescheMahlzeiten, verschiebeMahlzeiten, kopiereMahlzeiten,
} from "@/lib/supabase/essen-tag";

/**
 * Tagesmenü im Wochenplan: löschen, verschieben, kopieren.
 *
 * Alle drei nehmen eine Liste von Mahlzeiten-IDs statt eines Datums — nur so
 * lassen sich drei von fünf Mahlzeiten verschieben, ohne die anderen
 * anzufassen. Das war die eigentliche Anforderung; „ganzer Tag" ist bloss
 * der Fall, in dem alle Häkchen gesetzt sind.
 */

function ids(fd: FormData): string[] {
  return fd.getAll("mahlzeit")
    .map((v) => String(v))
    .filter((v) => v.length > 0);
}

function zielDatum(fd: FormData): string | null {
  const roh = String(fd.get("ziel") ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(roh) ? roh : null;
}

function neuLaden(): void {
  revalidatePath("/m/Essen");
  revalidatePath("/m/Essen/plan");
}

export async function tagLoeschen(fd: FormData): Promise<void> {
  await loescheMahlzeiten(ids(fd));
  neuLaden();
}

export async function tagVerschieben(fd: FormData): Promise<void> {
  const ziel = zielDatum(fd);
  if (!ziel) return;
  await verschiebeMahlzeiten(ids(fd), ziel);
  neuLaden();
}

export async function tagKopieren(fd: FormData): Promise<void> {
  const ziel = zielDatum(fd);
  if (!ziel) return;
  await kopiereMahlzeiten(ids(fd), ziel);
  neuLaden();
}
