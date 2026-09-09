import { redirect } from "next/navigation";

/**
 * Die Trading-Einstellungen sind am 09.09.2026 nach `/einstellungen/trading`
 * gezogen — ein Ort für alles, was man einmal einrichtet.
 *
 * Die alte Adresse bleibt als Weiterleitung stehen und wird nicht gelöscht:
 * sie steht in Lesezeichen, in der installierten App und in älteren Links
 * innerhalb des Projekts. Eine 404 wäre für nichts.
 */
export default function AlteTradingEinstellungen() {
  redirect("/einstellungen/trading");
}
