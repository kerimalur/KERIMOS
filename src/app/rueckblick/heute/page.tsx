import { redirect } from "next/navigation";

/**
 * Der Tagesrückblick steht seit 23.08.2026 oben auf `/rueckblick`.
 *
 * Diese Route bleibt als Weiterleitung bestehen und wird nicht gelöscht: Sie
 * steht im PWA-Shortcut, in der Abenderinnerung und in alten Telegram-
 * Nachrichten. Ein toter Link aus einer Benachrichtigung ist genau der
 * Moment, in dem man den Rückblick dann eben nicht schreibt.
 */
export default async function TagesrueckblickWeiterleitung({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  redirect(sp.t ? `/rueckblick?t=${encodeURIComponent(sp.t)}#heute` : "/rueckblick#heute");
}
