"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  finishWorkout, cancelWorkout,
  type SatzEingabe, type CardioEingabe,
} from "@/lib/actions";
import { Badge, Button, Card, CardTitle, Empty, Input, cx } from "@/components/ui";
import { formatDuration, formatHours, type RecoveryResult } from "@/lib/recovery";

interface Uebung {
  exerciseId: string;
  exerciseName: string;
  muscleGroupId: string;
  muscleGroupName: string;
  baseRecoveryHours: number;
  isCardio: boolean;
  targetSets: number;
  targetReps: string;
  lastSets: { weightKg: number; reps: number; rir: number }[];
}
interface Alternative {
  id: string; name: string; muscleGroupId: string; muscleGroupName: string;
  baseRecoveryHours: number; equipment: string | null;
}

/** Ein Satz, wie er auf dem Bildschirm steht. */
interface Satz {
  weightKg: number;
  reps: number;
  rir: number;
  erledigt: boolean;
}
/** Der Zustand einer Übung während des Trainings. */
interface UebungStand extends Uebung {
  saetze: Satz[];
  durationMinutes: number;
  distanceKm: number | null;
  cardioErledigt: boolean;
}

/**
 * Das laufende Training.
 *
 * Der Zustand liegt im Browser und wird bei jeder Änderung in den
 * localStorage gespiegelt. Das ist der wichtigste Teil: sperrt sich das
 * Handy in der Umkleide oder lädt die Seite neu, ist die Einheit sonst weg.
 * Erst beim Abschliessen wandert alles in die Datenbank.
 */
export function WorkoutTracker({
  sessionId, trainingDayName, startedAt, exercises, alternativen,
}: {
  sessionId: string;
  trainingDayName: string;
  startedAt: string;
  exercises: Uebung[];
  /** Alle Übungen, nach denen beim Tauschen gesucht werden kann. */
  alternativen: Alternative[];
}) {
  const router = useRouter();
  const speicherKey = `workout:${sessionId}`;
  const pauseKey = `workoutPause:${sessionId}`;

  const [stand, setStand] = useState<UebungStand[]>(() =>
    exercises.map((e) => ({
      ...e,
      saetze: Array.from({ length: e.targetSets }, () => ({
        weightKg: 0, reps: 0, rir: 2, erledigt: false,
      })),
      durationMinutes: 0,
      distanceKm: null,
      cardioErledigt: false,
    }))
  );
  const [offen, setOffen] = useState<number | null>(0);
  const [tausch, setTausch] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [abschluss, setAbschluss] = useState<RecoveryResult[] | null>(null);
  const [geladen, setGeladen] = useState(false);

  // Zwischenstand zurückholen - läuft nur einmal beim Öffnen
  useEffect(() => {
    try {
      const roh = localStorage.getItem(speicherKey);
      if (roh) {
        const gespeichert = JSON.parse(roh) as UebungStand[];
        if (Array.isArray(gespeichert) && gespeichert.length > 0) setStand(gespeichert);
      }
    } catch {
      // Kaputter Eintrag ist kein Grund, das Training zu blockieren
    }
    setGeladen(true);
  }, [speicherKey]);

  // Ab dann jede Änderung sichern
  useEffect(() => {
    if (!geladen) return;
    try {
      localStorage.setItem(speicherKey, JSON.stringify(stand));
    } catch {
      // Voller Speicher darf das Training nicht abbrechen
    }
  }, [stand, geladen, speicherKey]);

  const aendere = useCallback(
    (idx: number, f: (u: UebungStand) => UebungStand) =>
      setStand((prev) => prev.map((u, i) => (i === idx ? f(u) : u))),
    []
  );

  function satzAendern(idx: number, sIdx: number, feld: keyof Satz, wert: number | boolean) {
    aendere(idx, (u) => ({
      ...u,
      saetze: u.saetze.map((s, i) => (i === sIdx ? { ...s, [feld]: wert } : s)),
    }));
  }

  function satzAbhaken(idx: number, sIdx: number) {
    const wirdErledigt = !stand[idx]?.saetze[sIdx]?.erledigt;
    aendere(idx, (u) => ({
      ...u,
      saetze: u.saetze.map((s, i) => (i === sIdx ? { ...s, erledigt: !s.erledigt } : s)),
    }));
    // Ein abgehakter Satz startet die Pausenuhr neu
    if (wirdErledigt) {
      try { localStorage.setItem(pauseKey, String(Date.now())); } catch { /* egal */ }
    }
  }

  function satzAnhaengen(idx: number) {
    aendere(idx, (u) => {
      const letzter = u.saetze[u.saetze.length - 1];
      return {
        ...u,
        saetze: [...u.saetze, {
          weightKg: letzter?.weightKg ?? 0,
          reps: letzter?.reps ?? 0,
          rir: letzter?.rir ?? 2,
          erledigt: false,
        }],
      };
    });
  }

  function satzEntfernen(idx: number) {
    aendere(idx, (u) => ({
      ...u,
      saetze: u.saetze.length > 1 ? u.saetze.slice(0, -1) : u.saetze,
    }));
  }

  function uebungTauschen(idx: number, alt: Alternative) {
    aendere(idx, (u) => ({
      ...u,
      exerciseId: alt.id,
      exerciseName: alt.name,
      muscleGroupId: alt.muscleGroupId,
      muscleGroupName: alt.muscleGroupName,
      baseRecoveryHours: alt.baseRecoveryHours,
      // Werte der alten Übung passen nicht mehr - Sätze bleiben, Zahlen nicht
      saetze: u.saetze.map(() => ({ weightKg: 0, reps: 0, rir: 2, erledigt: false })),
      lastSets: [],
    }));
    setTausch(null);
  }

  /** Ein Satz zählt, wenn er abgehakt ist oder Wiederholungen drinstehen. */
  const gezaehlteSaetze = (u: UebungStand) =>
    u.saetze.filter((s) => s.erledigt || s.reps > 0);

  const kraft = stand.filter((u) => !u.isCardio);
  const fertigeUebungen = kraft.filter(
    (u) => u.saetze.length > 0 && u.saetze.every((s) => s.erledigt)
  ).length;
  const saetzeGesamt = stand.reduce((s, u) => s + gezaehlteSaetze(u).length, 0);
  const volumen = stand.reduce(
    (s, u) => s + gezaehlteSaetze(u).reduce((x, t) => x + t.weightKg * t.reps, 0), 0
  );

  async function abschliessen() {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      const sets: SatzEingabe[] = stand.flatMap((u) =>
        u.isCardio ? [] : gezaehlteSaetze(u).map((s, i) => ({
          exerciseId: u.exerciseId,
          muscleGroupId: u.muscleGroupId,
          baseRecoveryHours: u.baseRecoveryHours,
          setNumber: i + 1,
          weightKg: s.weightKg,
          reps: s.reps,
          rir: s.rir,
        }))
      );
      const cardio: CardioEingabe[] = stand
        .filter((u) => u.isCardio && u.durationMinutes > 0)
        .map((u) => ({
          exerciseId: u.exerciseId,
          durationMinutes: u.durationMinutes,
          distanceKm: u.distanceKm,
        }));

      const fd = new FormData();
      fd.set("session_id", sessionId);
      fd.set("sets", JSON.stringify(sets));
      fd.set("cardio", JSON.stringify(cardio));
      const ergebnis = await finishWorkout(fd);

      try {
        localStorage.removeItem(speicherKey);
        localStorage.removeItem(pauseKey);
      } catch { /* egal */ }
      setAbschluss(ergebnis);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Abschliessen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function abbrechen() {
    if (busy) return;
    if (!confirm("Training abbrechen? Alles Erfasste wird gelöscht.")) return;
    setBusy(true);
    setFehler(null);
    try {
      const fd = new FormData();
      fd.set("session_id", sessionId);
      await cancelWorkout(fd);
      try {
        localStorage.removeItem(speicherKey);
        localStorage.removeItem(pauseKey);
      } catch { /* egal */ }
      router.push("/gym");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Abbrechen fehlgeschlagen");
      setBusy(false);
    }
  }

  if (abschluss) {
    return (
      <Zusammenfassung
        ergebnisse={abschluss}
        dauerSekunden={Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)}
        saetze={saetzeGesamt}
        volumen={volumen}
      />
    );
  }

  return (
    <>
      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad-tint px-4 py-3 text-sm text-bad">
          {fehler}
        </div>
      )}

      {/* Kopfzeile: klebt oben, damit Uhr und Abschluss immer erreichbar sind */}
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line/70 bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
              Training läuft
            </p>
            <p className="truncate text-sm font-medium text-ink">{trainingDayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Uhr seit={startedAt} />
            <Pausenuhr speicherKey={pauseKey} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">
              {fertigeUebungen}/{kraft.length}
            </span>
            <Button onClick={abschliessen} disabled={busy}
              className="px-3 py-1.5 text-xs">
              Fertig
            </Button>
          </div>
        </div>
      </div>

      {stand.length === 0 ? (
        <Empty>
          Dieser Trainingstag hat keine Übungen.{" "}
          <Link href="/gym/trainingstage" className="text-accent-soft hover:underline">
            Übungen zuordnen
          </Link>
        </Empty>
      ) : (
        stand.map((u, idx) => (
          <UebungsKarte
            key={`${u.exerciseId}-${idx}`}
            uebung={u}
            offen={offen === idx}
            onToggle={() => setOffen(offen === idx ? null : idx)}
            onSatzAendern={(sIdx, feld, wert) => satzAendern(idx, sIdx, feld, wert)}
            onSatzAbhaken={(sIdx) => satzAbhaken(idx, sIdx)}
            onSatzAnhaengen={() => satzAnhaengen(idx)}
            onSatzEntfernen={() => satzEntfernen(idx)}
            onCardio={(dauer, km) =>
              aendere(idx, (x) => ({
                ...x, durationMinutes: dauer, distanceKm: km,
                cardioErledigt: dauer > 0,
              }))}
            onTausch={() => setTausch(idx)}
          />
        ))
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">
            {saetzeGesamt} Sätze · {Math.round(volumen)} kg bewegt
          </span>
          <div className="flex gap-2">
            <Button variant="danger" onClick={abbrechen} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={abschliessen} disabled={busy}>
              Training abschliessen
            </Button>
          </div>
        </div>
      </Card>

      {tausch !== null && (
        <TauschDialog
          muskel={stand[tausch]?.muscleGroupName ?? ""}
          aktuelleId={stand[tausch]?.exerciseId ?? ""}
          alternativen={alternativen.filter(
            (a) => a.muscleGroupId === stand[tausch]?.muscleGroupId
          )}
          alleAlternativen={alternativen}
          onWaehlen={(alt) => uebungTauschen(tausch, alt)}
          onSchliessen={() => setTausch(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Uhren */

/** Läuft seit Trainingsbeginn - rechnet aus dem Zeitstempel, nicht hochzählend. */
function Uhr({ seit }: { seit: string }) {
  const [sekunden, setSekunden] = useState<number | null>(null);

  useEffect(() => {
    const tick = () =>
      setSekunden(Math.max(0, Math.floor((Date.now() - new Date(seit).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [seit]);

  // Erst nach dem ersten Tick anzeigen, sonst weicht der Server-Text ab
  if (sekunden === null) return null;
  return (
    <span className="tabular rounded-lg bg-sand px-2.5 py-1 text-sm font-medium text-ink">
      {formatDuration(sekunden)}
    </span>
  );
}

/**
 * Pause seit dem letzten abgehakten Satz. Der Startzeitpunkt steht im
 * localStorage - so läuft sie weiter, während das Handy gesperrt ist.
 */
function Pausenuhr({ speicherKey }: { speicherKey: string }) {
  const [sekunden, setSekunden] = useState<number | null>(null);

  useEffect(() => {
    function tick() {
      let roh: string | null = null;
      try { roh = localStorage.getItem(speicherKey); } catch { /* egal */ }
      if (!roh) { setSekunden(null); return; }
      const start = parseInt(roh, 10);
      if (Number.isNaN(start)) { setSekunden(null); return; }
      setSekunden(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [speicherKey]);

  if (sekunden === null) return null;
  return (
    <span className="tabular rounded-lg bg-warn-tint px-2.5 py-1 text-sm font-medium text-warn">
      {formatDuration(sekunden)} Pause
    </span>
  );
}

/* ---------------------------------------------------------- Übungskarte */

function UebungsKarte({
  uebung, offen, onToggle, onSatzAendern, onSatzAbhaken,
  onSatzAnhaengen, onSatzEntfernen, onCardio, onTausch,
}: {
  uebung: UebungStand;
  offen: boolean;
  onToggle: () => void;
  onSatzAendern: (sIdx: number, feld: keyof Satz, wert: number | boolean) => void;
  onSatzAbhaken: (sIdx: number) => void;
  onSatzAnhaengen: () => void;
  onSatzEntfernen: () => void;
  onCardio: (dauer: number, km: number | null) => void;
  onTausch: () => void;
}) {
  const fertig = uebung.isCardio
    ? uebung.durationMinutes > 0
    : uebung.saetze.length > 0 && uebung.saetze.every((s) => s.erledigt);
  const abgehakt = uebung.saetze.filter((s) => s.erledigt).length;

  return (
    <Card className={cx("p-4", fertig && "border-good/40 bg-good-tint/40")}>
      <div className="flex cursor-pointer items-center gap-3" onClick={onToggle}>
        <span className={cx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-medium",
          fertig ? "bg-good-tint text-good"
            : uebung.isCardio ? "bg-warn-tint text-warn" : "bg-accent-tint text-accent-soft"
        )}>
          {fertig ? "✓" : uebung.isCardio ? "≈" : `${uebung.saetze.length}×`}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {uebung.exerciseName}
          </span>
          <span className="block text-xs text-ink-muted">
            {uebung.isCardio
              ? "Cardio · Dauer und Distanz"
              : `${uebung.targetSets} × ${uebung.targetReps} Wdh.`}
            {" · "}{uebung.muscleGroupName}
          </span>
        </span>
        {!uebung.isCardio && (
          <span className={cx("tabular shrink-0 rounded-lg px-2 py-1 text-xs font-medium",
            fertig ? "bg-good-tint text-good" : "bg-sand text-ink-muted")}>
            {abgehakt}/{uebung.saetze.length}
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); onTausch(); }}
          aria-label="Übung ersetzen"
          className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-ink-faint transition hover:text-ink">
          ⇄
        </button>
        <span className="shrink-0 text-xs text-ink-faint">{offen ? "▴" : "▾"}</span>
      </div>

      {offen && (
        <div className="mt-3">
          {uebung.isCardio ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-muted">Dauer (Min)</span>
                <Input type="number" min={0} inputMode="numeric"
                  value={uebung.durationMinutes || ""}
                  onChange={(e) =>
                    onCardio(parseInt(e.target.value) || 0, uebung.distanceKm)}
                  placeholder="30" className="text-center" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-muted">Distanz (km)</span>
                <Input type="number" min={0} step="0.1" inputMode="decimal"
                  value={uebung.distanceKm ?? ""}
                  onChange={(e) =>
                    onCardio(uebung.durationMinutes, parseFloat(e.target.value) || null)}
                  placeholder="optional" className="text-center" />
              </label>
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-[24px_1fr_1fr_1fr_36px] gap-1.5 px-1">
                {["#", "kg", "Wdh", "RIR", ""].map((h, i) => (
                  <span key={i}
                    className="text-center text-[10px] uppercase tracking-wide text-ink-muted">
                    {h}
                  </span>
                ))}
              </div>
              <div className="space-y-1.5">
                {uebung.saetze.map((s, i) => (
                  <SatzZeile key={i} nummer={i + 1} satz={s}
                    vorher={uebung.lastSets[i] ?? null}
                    onAendern={(feld, wert) => onSatzAendern(i, feld, wert)}
                    onAbhaken={() => onSatzAbhaken(i)} />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={onSatzAnhaengen}
                  className="text-xs text-accent-soft transition hover:underline">
                  + Satz
                </button>
                {uebung.saetze.length > 1 && (
                  <button onClick={onSatzEntfernen}
                    className="text-xs text-ink-faint transition hover:text-bad">
                    − Satz
                  </button>
                )}
                <span className="ml-auto text-[11px] text-ink-faint">
                  RIR = Wiederholungen, die noch drin gewesen wären
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** Farbskala für RIR: rot heisst bis ans Limit, grün heisst locker. */
const RIR_KLASSE: Record<number, string> = {
  0: "bg-bad-tint text-bad",
  1: "bg-bad-tint text-bad",
  2: "bg-warn-tint text-warn",
  3: "bg-warn-tint text-warn",
  4: "bg-good-tint text-good",
  5: "bg-good-tint text-good",
};

function SatzZeile({
  nummer, satz, vorher, onAendern, onAbhaken,
}: {
  nummer: number;
  satz: Satz;
  vorher: { weightKg: number; reps: number; rir: number } | null;
  onAendern: (feld: keyof Satz, wert: number | boolean) => void;
  onAbhaken: () => void;
}) {
  return (
    <div className={cx("rounded-xl px-1.5 py-1.5",
      satz.erledigt ? "bg-good-tint" : "bg-sand/60")}>
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-1.5">
        <span className={cx("text-center text-xs font-medium",
          satz.erledigt ? "text-good" : "text-ink-muted")}>
          {nummer}
        </span>
        <ZahlFeld wert={satz.weightKg} onAendern={(v) => onAendern("weightKg", v)}
          platzhalter={vorher ? String(vorher.weightKg) : "0"}
          gesperrt={satz.erledigt} label={`Gewicht Satz ${nummer}`} />
        <ZahlFeld wert={satz.reps} onAendern={(v) => onAendern("reps", v)}
          platzhalter={vorher ? String(vorher.reps) : "0"}
          gesperrt={satz.erledigt} label={`Wiederholungen Satz ${nummer}`} ganzzahl />
        <select value={satz.rir} disabled={satz.erledigt}
          onChange={(e) => onAendern("rir", Number(e.target.value))}
          aria-label={`RIR Satz ${nummer}`}
          className={cx(
            "w-full rounded-lg border border-line py-2 text-center text-xs font-medium outline-none transition disabled:opacity-60",
            RIR_KLASSE[satz.rir] ?? "bg-sand text-ink-soft"
          )}>
          {[0, 1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={onAbhaken}
          aria-label={satz.erledigt ? "Satz wieder öffnen" : "Satz abschliessen"}
          className={cx(
            "flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition active:scale-90",
            satz.erledigt
              ? "border-good bg-good text-white"
              : "border-line bg-card text-ink-faint hover:border-good/50 hover:text-good"
          )}>
          ✓
        </button>
      </div>
      {vorher && (
        <div className="grid grid-cols-[24px_1fr_1fr_1fr_36px] gap-1.5 px-1 pt-1">
          <span />
          <span className="text-center text-[10px] text-ink-faint">
            {vorher.weightKg !== 0 ? `zuletzt ${vorher.weightKg}` : "—"}
          </span>
          <span className="text-center text-[10px] text-ink-faint">
            {vorher.reps > 0 ? `zuletzt ${vorher.reps}` : "—"}
          </span>
          <span className="text-center text-[10px] text-ink-faint">RIR {vorher.rir}</span>
          <span />
        </div>
      )}
    </div>
  );
}

/**
 * Zahlenfeld, das beim Tippen nicht dazwischenfunkt.
 *
 * Der Zwischenwert bleibt als Text stehen, solange das Feld den Fokus hat -
 * sonst würde "12," beim Tippen sofort zu 12 und die Kommastelle wäre weg.
 */
function ZahlFeld({
  wert, onAendern, platzhalter, gesperrt, label, ganzzahl = false,
}: {
  wert: number;
  onAendern: (v: number) => void;
  platzhalter: string;
  gesperrt: boolean;
  label: string;
  ganzzahl?: boolean;
}) {
  const [text, setText] = useState("");
  const [fokus, setFokus] = useState(false);

  return (
    <input
      type="text"
      inputMode={ganzzahl ? "numeric" : "decimal"}
      aria-label={label}
      disabled={gesperrt}
      placeholder={platzhalter}
      value={fokus ? text : wert !== 0 ? String(wert) : ""}
      onFocus={() => { setFokus(true); setText(wert !== 0 ? String(wert) : ""); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFokus(false);
        const zahl = parseFloat(text.replace(",", "."));
        onAendern(Number.isNaN(zahl) ? 0 : ganzzahl ? Math.round(zahl) : zahl);
        setText("");
      }}
      className="w-full rounded-lg border border-line bg-card py-2 text-center text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
    />
  );
}

/* --------------------------------------------------------- Übung tauschen */

function TauschDialog({
  muskel, aktuelleId, alternativen, alleAlternativen, onWaehlen, onSchliessen,
}: {
  muskel: string;
  aktuelleId: string;
  alternativen: Alternative[];
  alleAlternativen: Alternative[];
  onWaehlen: (alt: Alternative) => void;
  onSchliessen: () => void;
}) {
  const [suche, setSuche] = useState("");

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    // Ohne Suche nur die passende Muskelgruppe, mit Suche alles
    const basis = q ? alleAlternativen : alternativen;
    return basis
      .filter((a) => a.id !== aktuelleId)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [suche, alternativen, alleAlternativen, aktuelleId]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <CardTitle className="mb-0">Andere Übung für {muskel}</CardTitle>
          <button onClick={onSchliessen} aria-label="Schliessen"
            className="text-sm text-ink-faint transition hover:text-ink">✕</button>
        </div>

        <Input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen — leer zeigt nur passende Übungen"
          className="mb-3" aria-label="Übung suchen" />

        {treffer.length === 0 ? (
          <Empty>Keine andere Übung gefunden.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {treffer.map((a) => (
              <li key={a.id}>
                <button onClick={() => onWaehlen(a)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:text-accent-soft">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{a.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {a.muscleGroupName}
                      {a.equipment && ` · ${a.equipment}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">wählen →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Zusammenfassung */

function Zusammenfassung({
  ergebnisse, dauerSekunden, saetze, volumen,
}: {
  ergebnisse: RecoveryResult[];
  dauerSekunden: number;
  saetze: number;
  volumen: number;
}) {
  const sortiert = [...ergebnisse].sort(
    (a, b) => b.totalRecoveryHours - a.totalRecoveryHours
  );

  return (
    <>
      <Card className="text-center">
        <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-good-tint text-2xl text-good">
          ✓
        </span>
        <h2 className="text-xl font-medium text-ink">Training abgeschlossen</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Ab jetzt erholt sich der Körper — die Zeiten unten sind Schätzungen.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Dauer", wert: formatDuration(dauerSekunden) },
            { label: "Sätze", wert: String(saetze) },
            { label: "Volumen", wert: `${Math.round(volumen)} kg` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-sand/60 p-3">
              <p className="tabular text-lg font-medium text-ink">{s.wert}</p>
              <p className="text-xs text-ink-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Erholung</CardTitle>
        {sortiert.length === 0 ? (
          <Empty>Keine Muskelgruppe erfasst — es wurden keine Sätze eingetragen.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {sortiert.map((r) => (
              <li key={r.muscleGroupId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{r.muscleGroupName}</span>
                  <span className="block text-xs text-ink-muted">
                    wieder bereit {erholungsText(r.estimatedFullRecoveryAt)}
                  </span>
                </span>
                <Badge>{formatHours(r.totalRecoveryHours)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Link href="/gym"
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-soft">
            Zur Übersicht
          </Link>
          <Link href="/gym/verlauf"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-card px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:text-ink">
            Verlauf ansehen
          </Link>
        </div>
      </Card>
    </>
  );
}

/** "heute um 18:30" · "Do, 7. Aug um 09:00" */
function erholungsText(iso: string): string {
  const d = new Date(iso);
  const stunden = (d.getTime() - Date.now()) / 3_600_000;
  const zeit = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  if (stunden < 24) return `heute um ${zeit}`;
  if (stunden < 48) return `morgen um ${zeit}`;
  return `${d.toLocaleDateString("de-CH", {
    weekday: "short", day: "numeric", month: "short",
  })} um ${zeit}`;
}
