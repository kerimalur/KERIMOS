/**
 * Wetter für heute — Open-Meteo.
 *
 * Bewusst ohne Schlüssel und ohne Konto: Open-Meteo ist für private Nutzung
 * frei. Die Antwort wird eine halbe Stunde zwischengespeichert; öfter ändert
 * sich eine Tagesvorhersage ohnehin nicht.
 */

/** Solothurn. */
const LAT = 47.2088;
const LON = 7.5323;

export interface Weather {
  /** Temperatur jetzt, gerundet. */
  jetzt: number;
  min: number;
  max: number;
  /** Höchste Regenwahrscheinlichkeit des Tages in Prozent. */
  regenChance: number;
  /** Erwartete Regenmenge in mm. */
  regenMm: number;
  /** Kurztext aus dem WMO-Code, z.B. "wechselnd bewölkt". */
  text: string;
  /** Grobe Einordnung für die Farbe. */
  nass: boolean;
}

/** WMO-Wettercodes, zusammengefasst auf das, was man wissen will. */
function codeText(code: number): { text: string; nass: boolean } {
  if (code === 0) return { text: "klar", nass: false };
  if (code <= 2) return { text: "leicht bewölkt", nass: false };
  if (code === 3) return { text: "bedeckt", nass: false };
  if (code <= 48) return { text: "Nebel", nass: false };
  if (code <= 57) return { text: "Nieselregen", nass: true };
  if (code <= 67) return { text: "Regen", nass: true };
  if (code <= 77) return { text: "Schnee", nass: true };
  if (code <= 82) return { text: "Regenschauer", nass: true };
  if (code <= 86) return { text: "Schneeschauer", nass: true };
  return { text: "Gewitter", nass: true };
}

export async function fetchWeather(): Promise<Weather | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${LAT}&longitude=${LON}` +
    "&current=temperature_2m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max," +
    "precipitation_sum,weather_code" +
    "&timezone=Europe%2FZurich&forecast_days=1";

  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const d = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        precipitation_sum?: number[];
        weather_code?: number[];
      };
    };

    const tagesCode = d.daily?.weather_code?.[0] ?? d.current?.weather_code ?? 3;
    const { text, nass } = codeText(tagesCode);

    return {
      jetzt: Math.round(d.current?.temperature_2m ?? 0),
      min: Math.round(d.daily?.temperature_2m_min?.[0] ?? 0),
      max: Math.round(d.daily?.temperature_2m_max?.[0] ?? 0),
      regenChance: Math.round(d.daily?.precipitation_probability_max?.[0] ?? 0),
      regenMm: Math.round((d.daily?.precipitation_sum?.[0] ?? 0) * 10) / 10,
      text,
      nass,
    };
  } catch {
    // Kein Wetter ist kein Fehler - die Karte lässt die Spalte dann leer.
    return null;
  }
}
