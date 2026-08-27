// Kontrollwerte für die Screenshots am Trade (ab 27.08.2026).
// Aufruf:  npx -y tsx tools/checks/screenshots.mts
import {
  pruefeBild, bildPfad, pfadAusUrl, EIMER, MAX_BILDER, MAX_BYTES,
} from "../../src/lib/trading/screenshots";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

const ok = (t: string, g: number, da = 0) => pruefeBild(t, g, da).ok;

check("PNG geht", ok("image/png", 200_000), true);
check("JPEG geht", ok("image/jpeg", 200_000), true);
check("Grossschreibung stoert nicht", ok("IMAGE/PNG", 200_000), true);
check("PDF geht nicht", ok("application/pdf", 200_000), false);
check("Video geht nicht", ok("video/mp4", 200_000), false);
check("leerer Typ geht nicht", ok("", 200_000), false);
check("leere Datei geht nicht", ok("image/png", 0), false);
check("negative Groesse geht nicht", ok("image/png", -5), false);
check("genau an der Grenze geht noch", ok("image/png", MAX_BYTES), true);
check("ein Byte darueber nicht", ok("image/png", MAX_BYTES + 1), false);
check("beim Maximum ist Schluss", ok("image/png", 200_000, MAX_BILDER), false);
check("eins darunter geht noch", ok("image/png", 200_000, MAX_BILDER - 1), true);

// Der Grund steht im Klartext, nicht als Code — er landet direkt im Formular.
check("Grund nennt den Typ",
  pruefeBild("application/pdf", 1000, 0).grund.includes("application/pdf"), true);
check("Grund nennt die Grenze",
  pruefeBild("image/png", MAX_BYTES + 1, 0).grund.includes("8"), true);

/* --------------------------------------------------------------- Pfad */
check("Ordner je Trade, Endung aus dem Typ",
  bildPfad("abc-123", "image/png", 1756000000000, "x7k9qz"),
  "abc-123/1756000000000-x7k9qz.png");
check("JPEG wird jpg", bildPfad("a", "image/jpeg", 1, "b").endsWith(".jpg"), true);
// Der Trade-Schluessel kommt aus der Datenbank und ist eine UUID — trotzdem
// gefiltert, weil ein Pfad mit ../ im Eimer irgendwo landen wuerde.
check("Schraegstriche fliegen raus",
  bildPfad("../../boese", "image/png", 1, "b"), "boese/1-b.png");
check("Zufall wird gekuerzt",
  bildPfad("a", "image/png", 1, "abcdefghijklmnop"), "a/1-abcdef.png");
check("unbekannter Typ bekommt bin",
  bildPfad("a", "image/tiff", 1, "b").endsWith(".bin"), true);

/* ---------------------------------------------------------------- URL */
const url = `https://xyz.supabase.co/storage/v1/object/public/${EIMER}/abc/1-b.png`;
check("Pfad aus der URL", pfadAusUrl(url), "abc/1-b.png");
check("Abfrageteil faellt weg", pfadAusUrl(`${url}?v=2`), "abc/1-b.png");
check("fremde URL gibt nichts", pfadAusUrl("https://example.com/bild.png"), null);
check("leer gibt nichts", pfadAusUrl(""), null);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
if (fails > 0) process.exit(1);
