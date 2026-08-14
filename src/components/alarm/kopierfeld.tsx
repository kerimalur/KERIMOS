"use client";
import { useState } from "react";

/**
 * Codeblock mit Kopierknopf.
 *
 * Für Dinge, die man wortwörtlich woanders einfügen muss — SQL für den
 * Supabase-Editor, die Cron-URL für cron-job.org. Von Hand abtippen ist bei
 * einem 40-stelligen Geheimnis keine Option, und ein Tippfehler äussert sich
 * als „der Alarm kommt nicht", nicht als Fehlermeldung.
 */
export function KopierFeld({ text, label }: { text: string; label?: string }) {
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
    } catch {
      // Ohne Zwischenablage-Recht (http, alter Browser) bleibt der Text
      // markierbar - deshalb nur der Knopf still, nicht die Anzeige.
      setKopiert(false);
    }
  }

  return (
    <div className="relative">
      {label && <div className="mb-1 text-xs text-ink-muted">{label}</div>}
      <pre className="overflow-x-auto rounded-xl bg-sand/70 p-3 pr-24 text-[11.5px] leading-relaxed text-ink-soft">
        <code>{text}</code>
      </pre>
      <button type="button" onClick={kopieren}
        className="absolute right-2 top-2 rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] text-ink-muted transition hover:text-ink"
        style={{ top: label ? "1.65rem" : "0.5rem" }}>
        {kopiert ? "kopiert" : "kopieren"}
      </button>
    </div>
  );
}
