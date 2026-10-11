import { redirect } from "next/navigation";

/**
 * Das Cockpit ist seit dem 11.10.2026 abgeschaltet: gehandelt wird auf den
 * eigenen Linien im Markt-Tab. Alte Links (Startseite, Alarme) landen dort.
 * Die frühere Seite liegt unter app/trading/_cockpit (nicht erreichbar).
 */
export default function Cockpit() {
  redirect("/trading");
}
