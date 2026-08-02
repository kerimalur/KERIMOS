import { Children, isValidElement, cloneElement } from "react";
import type { ReactElement, ReactNode, CSSProperties } from "react";

/**
 * Lässt die Kinder nacheinander einschweben statt alle auf einmal.
 *
 * Die Modus-Kacheln machen das schon länger über einen animationDelay je
 * Index - die Karten darüber erschienen dagegen schlagartig. Der kurze
 * Versatz führt das Auge von oben nach unten durch die Seite.
 *
 * Der Versatz ist bei 55 ms gedeckelt und läuft nach acht Elementen aus:
 * bei zwölf Karten wären 12 × 55 ms fast eine Sekunde, und die letzte Karte
 * würde spürbar zu spät kommen.
 */
export function Stagger({
  children, className, schritt = 55, maxIndex = 8,
}: {
  children: ReactNode;
  className?: string;
  schritt?: number;
  maxIndex?: number;
}) {
  let i = 0;

  return (
    <div className={className}>
      {Children.map(children, (kind) => {
        // Bedingt gerenderte Karten liefern null - die zählen nicht mit,
        // sonst entstünden Lücken im Rhythmus.
        if (!isValidElement(kind)) return kind;

        const verzoegerung = Math.min(i, maxIndex) * schritt;
        i += 1;

        const element = kind as ReactElement<{ style?: CSSProperties; className?: string }>;
        return (
          <div className="animate-pop" style={{ animationDelay: `${verzoegerung}ms` }}>
            {element}
          </div>
        );
      })}
    </div>
  );
}
