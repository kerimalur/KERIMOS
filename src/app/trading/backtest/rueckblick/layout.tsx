import { BereichTabs, type Reiter } from "@/components/trading/bereich-tabs";

/**
 * Zwei Unteransichten des Rückblicks — beide beantworten dieselbe Frage auf
 * verschiedenen Zeitskalen.
 *
 * „Ein Trade" fragt: hättest du an DIESEM Tag Rückenwind gehabt?
 * „Faktor & Grenze" fragt: trägt der Faktor über zwanzig Jahre überhaupt?
 *
 * Die zweite Ansicht stand bis zum 24.08.2026 auf Monty, also auf der Seite,
 * die die Lage von heute zeigt. Das war der falsche Ort: wer morgens auf
 * Monty schaut, will keine Kalibrierung sehen, und wer kalibriert, tut das
 * nicht nebenbei. Beides sind Auswertungen über Vergangenes und gehören
 * deshalb in den Backtest.
 */
const REITER: Reiter[] = [
  { href: "/trading/backtest/rueckblick", label: "Ein Trade", exakt: true },
  { href: "/trading/backtest/rueckblick/faktor", label: "Faktor & Grenze" },
];

export default function RueckblickLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <BereichTabs reiter={REITER} />
      {children}
    </div>
  );
}
