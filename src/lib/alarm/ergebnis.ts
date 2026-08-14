/**
 * Rückgabewert der Alarm-Server-Actions.
 *
 * Eigene Datei, weil eine `"use server"`-Datei ausschliesslich async
 * Funktionen exportieren darf — ein `export const LEER` dort bricht den
 * Build. Client und Server teilen sich diesen Typ, deshalb weder
 * `"use server"` noch `"server-only"`.
 */
export interface AktionsErgebnis {
  ok: boolean;
  text: string;
  /**
   * Zeitstempel des Laufs. Zwei Zwecke: React zeichnet auch dann neu, wenn
   * zweimal dieselbe Meldung kommt, und die Oberfläche kann bei mehreren
   * Aktionen die zuletzt gelaufene anzeigen.
   */
  stempel: number;
}

export const LEER: AktionsErgebnis = { ok: true, text: "", stempel: 0 };
