"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui";

/**
 * Abendmodus: schaltet die Farbdarstellung des ganzen Windows-PCs um.
 *
 * Eine HTTPS-Seite darf am PC nichts ändern - deshalb läuft es andersherum.
 * Dieser Schalter schreibt nur einen Wunsch in die Tabelle `display_mode`;
 * ein Helper auf dem PC hört per Realtime darauf und schaltet um. Was hier
 * angezeigt wird, ist immer der Stand aus der Datenbank, nie der bloss
 * geklickte - deshalb gibt es "wird übernommen", bis der Helper bestätigt.
 *
 * Der Schalter funktioniert damit auch vom Handy aus, über dieselbe URL.
 */

type Modus = "normal" | "grayscale" | "red";

type Zeile = {
  id: string;
  mode: Modus;
  requested_at: string;
  applied_at: string | null;
  helper_last_seen: string | null;
  last_error: string | null;
};

/** Für später: ein zweiter PC bekäme eine zweite Zeile mit anderem Namen. */
const GERAET = "desktop";

/** Ohne Herzschlag in diesem Zeitraum gilt der Helper als offline. */
const OFFLINE_NACH_MS = 90_000;

const NAECHSTER: Record<Modus, Modus> = {
  normal: "grayscale",
  grayscale: "red",
  red: "normal",
};

const STUFE: Record<
  Modus,
  { label: string; erklaerung: string; farbe: string; grund: string; kante: string }
> = {
  normal: {
    label: "Normal",
    erklaerung: "volle Farbe",
    farbe: "#6FA3D8",
    grund: "rgba(111,163,216,.12)",
    kante: "rgba(111,163,216,.35)",
  },
  grayscale: {
    label: "Graustufe",
    erklaerung: "Farbe raus, Reiz runter",
    farbe: "#CBC0AC",
    grund: "rgba(203,192,172,.12)",
    kante: "rgba(203,192,172,.35)",
  },
  red: {
    label: "Rotstufe",
    erklaerung: "warm, fürs Einschlafen",
    farbe: "#E28B72",
    grund: "rgba(226,139,114,.14)",
    kante: "rgba(226,139,114,.4)",
  },
};

function Symbol({ modus, farbe }: { modus: Modus; farbe: string }) {
  const gemeinsam = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true } as const;

  if (modus === "normal") {
    // Sonne: alles an, volle Farbe
    return (
      <svg {...gemeinsam} fill="none" stroke={farbe} strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }
  if (modus === "grayscale") {
    // Halb gefüllter Kreis: das übliche Zeichen für Kontrast/Entfärben
    return (
      <svg {...gemeinsam} fill="none" stroke={farbe} strokeWidth="1.7">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill={farbe} stroke="none" />
      </svg>
    );
  }
  // Mond: Abend, Bildschirm warm
  return (
    <svg {...gemeinsam} fill="none" stroke={farbe} strokeWidth="1.7" strokeLinejoin="round">
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />
    </svg>
  );
}

export function DisplayModeToggle() {
  // createBrowserClient ist ein Singleton je URL/Key - useMemo hält hier
  // trotzdem dieselbe Referenz fest, damit der Effekt nicht neu läuft.
  const supabase = useMemo(() => createClient(), []);

  const [zeile, setZeile] = useState<Zeile | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [schreibfehler, setSchreibfehler] = useState<string | null>(null);
  // Ticker: ohne ihn merkt die Seite nie, dass der Herzschlag ausbleibt -
  // ein toter Helper schickt ja gerade keine Ereignisse mehr.
  const [jetzt, setJetzt] = useState(() => Date.now());

  const zeileRef = useRef<Zeile | null>(null);
  zeileRef.current = zeile;

  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Einmal den Ist-Zustand lesen, Zeile bei Bedarf anlegen, danach nur
  // noch per Realtime nachführen.
  useEffect(() => {
    let abgemeldet = false;
    let kanal: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || abgemeldet) { setLaedt(false); return; }

      let gefunden: Zeile | null = null;
      const { data } = await supabase
        .from("display_mode")
        .select("id, mode, requested_at, applied_at, helper_last_seen, last_error")
        .eq("user_id", user.id)
        .eq("device", GERAET)
        .maybeSingle();
      gefunden = (data as Zeile | null) ?? null;

      if (!gefunden) {
        const { data: neu } = await supabase
          .from("display_mode")
          .upsert(
            { user_id: user.id, device: GERAET },
            { onConflict: "user_id,device", ignoreDuplicates: false },
          )
          .select("id, mode, requested_at, applied_at, helper_last_seen, last_error")
          .single();
        gefunden = (neu as Zeile | null) ?? null;
      }

      if (abgemeldet || !gefunden) { setLaedt(false); return; }
      setZeile(gefunden);
      setLaedt(false);

      kanal = supabase
        .channel(`display_mode_web_${gefunden.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "display_mode",
            filter: `id=eq.${gefunden.id}`,
          },
          (payload) => setZeile(payload.new as Zeile),
        )
        .subscribe();
    })();

    return () => {
      abgemeldet = true;
      if (kanal) supabase.removeChannel(kanal);
    };
  }, [supabase]);

  const weiterschalten = useCallback(async () => {
    const aktuell = zeileRef.current;
    if (!aktuell || sendet) return;

    setSendet(true);
    setSchreibfehler(null);
    const ziel = NAECHSTER[aktuell.mode];

    // Bewusst mit .select(): was zurückkommt, ist der echte Stand aus der
    // Datenbank - kein optimistisch gesetzter Wert.
    const { data, error } = await supabase
      .from("display_mode")
      .update({
        mode: ziel,
        requested_at: new Date().toISOString(),
        applied_at: null,
        last_error: null,
      })
      .eq("id", aktuell.id)
      .select("id, mode, requested_at, applied_at, helper_last_seen, last_error")
      .single();

    if (error) setSchreibfehler(error.message);
    else if (data) setZeile(data as Zeile);
    setSendet(false);
  }, [supabase, sendet]);

  if (laedt || !zeile) return null;

  const stufe = STUFE[zeile.mode];
  const gesehen = zeile.helper_last_seen ? Date.parse(zeile.helper_last_seen) : null;
  const offline = gesehen === null || jetzt - gesehen > OFFLINE_NACH_MS;
  const bestaetigt =
    zeile.applied_at !== null &&
    Date.parse(zeile.applied_at) >= Date.parse(zeile.requested_at);
  const wartet = !bestaetigt && !offline;
  const gesperrt = offline || sendet;

  const hinweis = offline
    ? "PC-Helper offline"
    : wartet
      ? "wird übernommen…"
      : stufe.erklaerung;

  return (
    <div className="animate-pop">
      <button
        type="button"
        onClick={weiterschalten}
        disabled={gesperrt}
        aria-label={`Bildschirm: ${stufe.label}. Weiterschalten auf ${STUFE[NAECHSTER[zeile.mode]].label}.`}
        title={
          offline
            ? "Der Helper auf dem PC meldet sich nicht. Läuft er?"
            : `Weiter auf ${STUFE[NAECHSTER[zeile.mode]].label}`
        }
        className={cx(
          "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left",
          "transition duration-150 ease-tactile",
          "disabled:cursor-not-allowed disabled:opacity-45",
          !gesperrt && "hover:border-line-strong active:scale-[0.98]",
        )}
        style={{
          background: offline ? undefined : stufe.grund,
          borderColor: offline ? undefined : stufe.kante,
        }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: offline ? "#271F16" : stufe.grund }}
        >
          <Symbol modus={zeile.mode} farbe={offline ? "#7A6E5C" : stufe.farbe} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Bildschirm
          </span>
          <span
            className="block truncate font-display text-sm font-bold"
            style={{ color: offline ? "#9A8C74" : stufe.farbe }}
          >
            {stufe.label}
          </span>
        </span>

        <span
          className={cx(
            "shrink-0 text-[11px]",
            wartet ? "animate-pulse text-accent" : "text-ink-muted",
          )}
        >
          {hinweis}
        </span>

        {/* Drei Punkte zeigen, wo im Zyklus man steht */}
        <span className="flex shrink-0 gap-1" aria-hidden>
          {(["normal", "grayscale", "red"] as Modus[]).map((m) => (
            <span
              key={m}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: offline
                  ? "#3E3222"
                  : m === zeile.mode
                    ? STUFE[m].farbe
                    : "#3E3222",
              }}
            />
          ))}
        </span>
      </button>

      {(zeile.last_error || schreibfehler) && (
        <p className="mt-1.5 px-1 text-[11px] text-bad-bright">
          {schreibfehler ?? zeile.last_error}
        </p>
      )}
    </div>
  );
}
