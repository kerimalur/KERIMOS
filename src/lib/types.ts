/**
 * Was von den Typen übrig ist.
 *
 * Bis zum 09.09.2026 standen hier Konten, Buchungen, Kategorien, Fixkosten,
 * Import-Regeln und Szenarien — das Geld-Modul, das schon seit dem 21.08.2026
 * ausgeblendet war. Mit dem Radikalschnitt sind sie mitsamt ihren Aktionen
 * entfallen. Die Tabellen stehen unangetastet in der Datenbank; der
 * vollständige Code liegt im Tag `vollstand-2026-09-09`.
 *
 * Übrig bleibt `NavLink`, und davon braucht die Startseite nur drei Felder:
 * die Kacheln stehen fest im Code, aus der Tabelle kommt nur noch das Bild.
 */

export type LinkKind = "section" | "web" | "folder";

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  section: "Bereich in KerimOS",
  web: "Adresse im Netz",
  folder: "Lokaler Ordner",
};

export interface NavLink {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  kind: LinkKind;
  target: string;
  group_name: string;
  icon: string | null;
  image_url: string | null;
  /** Sichtbarer Bildausschnitt, wie CSS object-position. */
  image_position: string;
  color: string;
  sort_order: number;
  open_count: number;
  last_opened_at: string | null;
  archived: boolean;
}
