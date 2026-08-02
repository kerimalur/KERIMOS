"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Zahl, die beim Erscheinen hochläuft.
 *
 * Zwei bewusste Entscheidungen:
 *
 * 1. Der Startwert ist nicht null, sondern 82 % des Ziels. Von null
 *    hochzuzählen dauert gefühlt ewig und man liest die Zahl zweimal - einmal
 *    falsch, einmal richtig. Die kurze Bewegung am Ende reicht völlig, um den
 *    Blick zu binden.
 *
 * 2. Wer im Betriebssystem reduzierte Bewegung eingestellt hat, sieht sofort
 *    den Endwert. Eine Kennzahl darf nie hinter einer Animation verschwinden.
 */
export function CountUp({
  value, prefix = "", suffix = "", dauer = 650, className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  dauer?: number;
  className?: string;
}) {
  const [angezeigt, setAngezeigt] = useState(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const sparsam = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (sparsam || value === 0) {
      setAngezeigt(value);
      return;
    }

    const start = Math.round(value * 0.82);
    const spanne = value - start;
    const beginn = performance.now();

    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - beginn) / dauer);
      // Sanft auslaufend - die Zahl kommt zur Ruhe statt abrupt zu stoppen
      const eased = 1 - Math.pow(1 - t, 3);
      setAngezeigt(Math.round(start + spanne * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(schritt);
    };

    rafRef.current = requestAnimationFrame(schritt);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, dauer]);

  return (
    <span className={className}>
      {prefix}{angezeigt.toLocaleString("de-CH")}{suffix}
    </span>
  );
}

/**
 * Kleine Schwester für Werte, die keine Bewegung brauchen, aber beim
 * Erscheinen kurz aufblitzen sollen - etwa Badges oder Sekundärzahlen.
 */
export function Fade({
  children, delay = 0, className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`animate-pop-fast ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  );
}
