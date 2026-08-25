import { redirect } from "next/navigation";

/**
 * Der Prep-Tab ist am 24.08.2026 entfallen.
 *
 * Grund von Kerim: seit Tage kopiert und verschoben werden können, ersetzt
 * das Kopieren den Prep-Planer, und die Rezeptideen erfüllen denselben Zweck.
 * Was wirklich gefehlt hätte — wie oft ein Gericht gekocht werden muss —
 * rechnet der Kochen-Tab.
 *
 * Die Seite bleibt als Umleitung stehen, damit Lesezeichen und der alte
 * `revalidatePath("/m/Essen/prep")` nicht ins Leere laufen. Die Daten
 * (`prep_batches`, `batch_portions`) sind unangetastet — sie tragen den
 * Kühlschrank-Stand auf der Heute-Seite und die Boxen im Tagesplan.
 */
export default function EssenPrepPage() {
  redirect("/m/Essen/kochen");
}
