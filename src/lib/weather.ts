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

/** Welches Symbol gezeichnet wird. */
export type WeatherIconName =
  | "sonne" | "mond" | "wolke" | "wolke-sonne" | "wolke-mond"
  | "regen" | "schnee" | "gewitter" | "nebel";

export interface Weather {
  /** Temperatur jetzt, gerundet. */
  jetzt: number;
  min: number;
  max: number;
  /** Höchste Regenwahrscheinlichkeit des Tages in Prozent. */
  regenChance: number;
  /** Erwartete Regenmenge in mm. */
  regenMm: number;
  /** Kurztext aus dem WMO-Code, z.B. "leicht bewölkt". */
  text: string;
  /** Grobe Einordnung für die Farbe. */
  nass: boolean;
  icon: WeatherIconName;
  /** Tag oder Nacht - entscheidet zwischen Sonne und Mond. */
  tag: boolean;
}

/**
 * WMO-Wettercodes, zusammengefasst auf das, was man wissen will.
 * Bei klarem und leicht bewölktem Himmel hängt das Symbol davon ab,
 * ob gerade Tag oder Nacht ist.
 */
function codeText(code: number, tag: boolean): {
  text: string; nass: boolean; icon: WeatherIconName;
} {
  if (code === 0) return { text: "klar", nass: false, icon: tag ? "sonne" : "mond" };
  if (code <= 2) {
    return {
      text: "leicht bewölkt", nass: false,
      icon: tag ? "wolke-sonne" : "wolke-mond",
    };
  }
  if (code === 3) return { text: "bedeckt", nass: false, icon: "wolke" };
  if (code <= 48) return { text: "Nebel", nass: false, icon: "nebel" };
  if (code <= 57) return { text: "Nieselregen", nass: true, icon: "regen" };
  if (code <= 67) return { text: "Regen", nass: true, icon: "regen" };
  if (code <= 77) return { text: "Schnee", nass: true, icon: "schnee" };
  if (code <= 82) return { text: "Regenschauer", nass: true, icon: "regen" };
  if (code <= 86) return { text: "Schneeschauer", nass: true, icon: "schnee" };
  return { text: "Gewitter", nass: true, icon: "gewitter" };
}

export async function fetchWeather(): Promise<Weather | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${LAT}&longitude=${LON}` +
    "&current=temperature_2m,weather_code,is_day" +
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
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        precipitation_sum?: number[];
        weather_code?: number[];
      };
    };

    // Das Symbol folgt dem aktuellen Wetter, der Text dem Tagesverlauf -
    // nachts eine Sonne zu zeigen wäre schlicht falsch.
    const tag = (d.current?.is_day ?? 1) === 1;
    const jetztCode = d.current?.weather_code ?? d.daily?.weather_code?.[0] ?? 3;
    const tagesCode = d.daily?.weather_code?.[0] ?? jetztCode;

    return {
      jetzt: Math.round(d.current?.temperature_2m ?? 0),
      min: Math.round(d.daily?.temperature_2m_min?.[0] ?? 0),
      max: Math.round(d.daily?.temperature_2m_max?.[0] ?? 0),
      regenChance: Math.round(d.daily?.precipitation_probability_max?.[0] ?? 0),
      regenMm: Math.round((d.daily?.precipitation_sum?.[0] ?? 0) * 10) / 10,
      text: codeText(tagesCode, tag).text,
      nass: codeText(tagesCode, tag).nass,
      icon: codeText(jetztCode, tag).icon,
      tag,
    };
  } catch {
    // Kein Wetter ist kein Fehler - die Karte lässt die Spalte dann leer.
    return null;
  }
}
