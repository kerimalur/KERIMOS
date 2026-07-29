import "server-only";

/**
 * Schlagzeilen aus einem RSS-Feed.
 *
 * Bewusst ohne Bibliothek: ein RSS-Dokument ist flach genug, dass ein paar
 * Ausdrücke genügen - und ohne Schlüssel, Konto oder Kosten. Standard ist der
 * News-Feed von SRF; über NEWS_FEED_URL lässt sich jeder andere setzen.
 */
export interface Headline {
  title: string;
  link: string;
  /** Zeitpunkt der Meldung, sofern der Feed einen nennt. */
  when: string | null;
}

const FEED = process.env.NEWS_FEED_URL ?? "https://www.srf.ch/news/bnf/rss/1646";

/** Entfernt CDATA-Hüllen und die üblichen HTML-Entitäten. */
function sauber(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function feld(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? sauber(m[1]) : null;
}

export async function fetchHeadlines(limit = 4): Promise<Headline[]> {
  try {
    const res = await fetch(FEED, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items = xml.split(/<item[\s>]/i).slice(1, limit + 1);
    return items.flatMap((block) => {
      const title = feld(block, "title");
      if (!title) return [];
      return [{
        title,
        link: feld(block, "link") ?? "",
        when: feld(block, "pubDate"),
      }];
    });
  } catch {
    return [];
  }
}

/** "vor 20 min" · "vor 3 h" · leer, wenn älter oder unbekannt. */
export function wieAlt(pubDate: string | null): string {
  if (!pubDate) return "";
  const t = new Date(pubDate).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  return h <= 12 ? `vor ${h} h` : "";
}
