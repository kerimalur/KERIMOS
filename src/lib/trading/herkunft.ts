/**
 * Herkunftsmarke für Zeilen in `trading_watchlist`, die aus einem GVA-Hit
 * entstanden sind.
 *
 * Es gibt bewusst keine eigene Spalte dafür: die Liste auf /trading ist EINE
 * Liste, und ein Eintrag aus dem Cockpit ist darin nichts anderes als eine von
 * Hand eingetragene Linie — nur bequemer entstanden. Die Marke dient allein
 * der Anzeige („kam aus dem Screener") und dem Wiederfinden beim Verwerfen.
 *
 * **Warum eine eigene Datei:** Sie stand vorher in `journal-actions.ts`. Eine
 * Datei mit `"use server"` darf ausschliesslich async Funktionen exportieren —
 * jeder andere Export bricht den Build, und zwar erst beim Bündeln, nicht beim
 * Typecheck. Konstanten, die eine Server-Aktion mit einer Seite teilt,
 * brauchen deshalb ein neutrales Zuhause.
 */
export const GVA_NOTIZ = "GVA-Hit";
