/**
 * Das Zeichen von KerimOS: vier Kacheln, eine davon ausgefüllt.
 *
 * Es bildet ab, was die Startseite tut — Modi nebeneinander, einer im
 * Vordergrund. Ein Zeichen, eine Farbe, keine Verläufe: so bleibt es
 * von 16 bis 512 Pixeln lesbar.
 */
export function Logo({
  className = "h-9 w-9", inverted = false,
}: {
  className?: string;
  /** true = weisses Zeichen auf farbigem Grund (App-Symbol, Kopfzeile). */
  inverted?: boolean;
}) {
  const voll = inverted ? "#FFFFFF" : "#5B8C7B";
  const leer = inverted ? "#FFFFFF" : "#5B8C7B";

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {inverted && <rect width="48" height="48" rx="11" fill="#5B8C7B" />}
      <rect x="12" y="12" width="11" height="11" rx="3" fill={voll} />
      <rect x="26" y="12" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
      <rect x="12" y="26" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
      <rect x="26" y="26" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
    </svg>
  );
}
