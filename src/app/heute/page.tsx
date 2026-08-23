import { redirect } from "next/navigation";

/**
 * `/heute` war die schlanke Erfassungsansicht fürs Handy.
 *
 * Sie hing an der Zeiterfassung und den Fokus-Sitzungen — beides seit dem
 * Zuschnitt vom 23.08.2026 weg. Die Route bleibt als Weiterleitung stehen und
 * wird nicht gelöscht: Sie steht als Verknüpfung im PWA-Manifest, und eine
 * Verknüpfung auf dem Startbildschirm, die ins Leere führt, ist schlimmer als
 * keine.
 */
export default function HeuteWeiterleitung() {
  redirect("/rueckblick#heute");
}
