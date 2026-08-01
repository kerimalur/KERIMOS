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
  /** true = dunkles Zeichen auf bernsteinfarbenem Grund (App-Symbol, Kopfzeile). */
  inverted?: boolean;
}) {
  const voll = inverted ? "#241708" : "#E7A96B";
  const leer = inverted ? "#241708" : "#E7A96B";

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {inverted && <rect width="48" height="48" rx="14" fill="#E7A96B" />}
      <rect x="12" y="12" width="11" height="11" rx="3" fill={voll} />
      <rect x="26" y="12" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
      <rect x="12" y="26" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
      <rect x="26" y="26" width="11" height="11" rx="3" fill={leer} opacity="0.45" />
    </svg>
  );
}
