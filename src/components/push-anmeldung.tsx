"use client";
import { useEffect, useState, useTransition } from "react";
import { Button, Badge } from "@/components/ui";
import {
  speicherePushAbo, loeschePushAbo, sendeTestBenachrichtigung,
} from "@/lib/push-actions";

/** Base64url (VAPID) -> Uint8Array, wie die Push-API es verlangt. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const roh = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...roh].map((c) => c.charCodeAt(0)));
}

type Status = "pruefe" | "nicht_moeglich" | "aus" | "blockiert" | "an";

/**
 * Anmeldung des Geräts für System-Benachrichtigungen.
 *
 * Der Ablauf ist vom Browser vorgegeben und läuft nur im Client: Service
 * Worker registrieren, Erlaubnis erfragen, Abo erzeugen - erst dann kann
 * der Server überhaupt etwas schicken. Deshalb liegt das hier und nicht in
 * einer Server Action.
 */
export function PushAnmeldung({ vapidKey }: { vapidKey: string | null }) {
  const [status, setStatus] = useState<Status>("pruefe");
  const [meldung, setMeldung] = useState("");
  const [laeuft, start] = useTransition();

  useEffect(() => {
    if (!vapidKey) { setStatus("nicht_moeglich"); return; }
    if (typeof window === "undefined"
      || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("nicht_moeglich");
      return;
    }
    if (Notification.permission === "denied") { setStatus("blockiert"); return; }

    navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((abo) => setStatus(abo ? "an" : "aus"))
      .catch(() => setStatus("nicht_moeglich"));
  }, [vapidKey]);

  async function anmelden() {
    setMeldung("");
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") {
        setStatus(erlaubnis === "denied" ? "blockiert" : "aus");
        setMeldung("Ohne Erlaubnis kann KerimOS nichts schicken.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const abo = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      });

      const roh = abo.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      if (!roh.endpoint || !roh.keys?.p256dh || !roh.keys?.auth) {
        setMeldung("Der Browser hat ein unvollständiges Abo geliefert.");
        return;
      }

      start(async () => {
        const text = await speicherePushAbo({
          endpoint: roh.endpoint!,
          p256dh: roh.keys!.p256dh,
          auth: roh.keys!.auth,
          label: navigator.userAgent.slice(0, 120),
        });
        setStatus("an");
        setMeldung(text);
      });
    } catch (fehler) {
      setMeldung(`Fehlgeschlagen: ${(fehler as Error).message}`);
    }
  }

  async function abmelden() {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (abo) {
      const endpoint = abo.endpoint;
      await abo.unsubscribe();
      start(async () => {
        const text = await loeschePushAbo(endpoint);
        setStatus("aus");
        setMeldung(text);
      });
    } else {
      setStatus("aus");
    }
  }

  function testen() {
    setMeldung("");
    start(async () => setMeldung(await sendeTestBenachrichtigung()));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">Dieses Gerät</span>
        {status === "an" && <Badge tone="good">angemeldet</Badge>}
        {status === "aus" && <Badge tone="neutral">nicht angemeldet</Badge>}
        {status === "blockiert" && <Badge tone="bad">im Browser blockiert</Badge>}
        {status === "nicht_moeglich" && <Badge tone="warn">nicht verfügbar</Badge>}
        {status === "pruefe" && <Badge tone="neutral">prüfe…</Badge>}
      </div>

      {status === "nicht_moeglich" && (
        <p className="mb-3 text-xs text-ink-muted">
          {vapidKey
            ? "Dieser Browser unterstützt keine Web-Push-Benachrichtigungen. Auf dem Handy Chrome verwenden."
            : "Es fehlen die VAPID-Schlüssel in den Umgebungsvariablen (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)."}
        </p>
      )}

      {status === "blockiert" && (
        <p className="mb-3 text-xs text-ink-muted">
          Du hast Benachrichtigungen für diese Seite abgelehnt. In Chrome:
          Schloss-Symbol in der Adressleiste → Berechtigungen →
          Benachrichtigungen → Zulassen, dann Seite neu laden.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(status === "aus") && (
          <Button onClick={anmelden} disabled={laeuft}>
            Benachrichtigungen einschalten
          </Button>
        )}
        {status === "an" && (
          <>
            <Button onClick={testen} disabled={laeuft}>
              {laeuft ? "Sende…" : "Testbenachrichtigung senden"}
            </Button>
            <Button variant="ghost" onClick={abmelden} disabled={laeuft}>
              Abmelden
            </Button>
          </>
        )}
      </div>

      {meldung && <p className="mt-3 text-xs text-ink-soft">{meldung}</p>}
    </div>
  );
}
