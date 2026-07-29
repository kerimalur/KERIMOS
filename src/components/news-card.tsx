import { fetchHeadlines, wieAlt } from "@/lib/news";
import { Card } from "@/components/ui";

/** Vier Schlagzeilen, mehr nicht - der Rest ist eine Zeitung. */
export async function NewsCard() {
  const meldungen = await fetchHeadlines(4);
  if (meldungen.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        Schlagzeilen
      </div>
      <ul className="space-y-2">
        {meldungen.map((m, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <a href={m.link} target="_blank" rel="noopener noreferrer"
              className="min-w-0 flex-1 text-sm text-ink transition hover:text-accent-soft">
              {m.title}
            </a>
            {wieAlt(m.when) && (
              <span className="shrink-0 text-[11px] text-ink-faint">{wieAlt(m.when)}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
