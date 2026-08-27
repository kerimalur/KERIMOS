/**
 * Screenshots am Trade — Namensgebung und Grenzen.
 *
 * Rein rechnerisch, keine Datenbank: prüfbar mit `tools/checks/screenshots.mts`.
 */

/** Der Eimer im Supabase-Storage. Wird beim ersten Bild selbst angelegt. */
export const EIMER = "trade-screenshots";

/** Was durchgeht. Kein PDF, kein HEIC — der Browser zeigt sonst nichts an. */
export const ERLAUBT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** 8 MB. Ein Chart-Screenshot liegt bei 200 KB bis 2 MB. */
export const MAX_BYTES = 8 * 1024 * 1024;

/** Wie viele Bilder je Trade. Mehr als das ist keine Dokumentation mehr. */
export const MAX_BILDER = 6;

export interface Pruefung {
  ok: boolean;
  grund: string;
}

/**
 * Darf diese Datei hoch?
 *
 * Der Typ wird geprüft, nicht die Endung: eine `.png`, die in Wahrheit ein
 * Video ist, käme sonst durch und wäre im Journal ein kaputtes Bild.
 */
export function pruefeBild(
  typ: unknown, groesse: unknown, schonDa: number,
): Pruefung {
  if (schonDa >= MAX_BILDER) {
    return { ok: false, grund: `Mehr als ${MAX_BILDER} Bilder je Trade gibt es nicht.` };
  }
  const t = typeof typ === "string" ? typ.toLowerCase() : "";
  if (!ERLAUBT.includes(t)) {
    return { ok: false, grund: `${t || "Unbekannter Typ"} geht nicht — nur PNG, JPEG, WebP oder GIF.` };
  }
  const g = Number(groesse);
  if (!Number.isFinite(g) || g <= 0) return { ok: false, grund: "Die Datei ist leer." };
  if (g > MAX_BYTES) {
    return { ok: false, grund: `Zu gross (${(g / 1024 / 1024).toFixed(1)} MB, erlaubt sind ${MAX_BYTES / 1024 / 1024}).` };
  }
  return { ok: true, grund: "" };
}

const ENDUNG: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

/**
 * Der Pfad im Eimer: ein Ordner je Trade, ein eindeutiger Name je Bild.
 *
 * Der Originalname geht bewusst NICHT mit ein. Er kommt aus Kerims
 * Zwischenablage, heisst dreimal „Bild.png" und kann Zeichen enthalten, die
 * in einer URL Ärger machen. Zeitstempel plus Zufall ist hässlicher und
 * kollidiert nie.
 */
export function bildPfad(tradeId: string, typ: string, jetzt: number, zufall: string): string {
  const endung = ENDUNG[typ.toLowerCase()] ?? "bin";
  const sauber = tradeId.replace(/[^A-Za-z0-9-]/g, "");
  return `${sauber}/${jetzt}-${zufall.replace(/[^a-z0-9]/g, "").slice(0, 6)}.${endung}`;
}

/** Aus einer öffentlichen URL den Pfad im Eimer zurückgewinnen — fürs Löschen. */
export function pfadAusUrl(url: string): string | null {
  const marke = `/${EIMER}/`;
  const i = url.indexOf(marke);
  if (i === -1) return null;
  const pfad = url.slice(i + marke.length).split("?")[0];
  return pfad || null;
}
