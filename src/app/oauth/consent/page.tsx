"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";

/**
 * Zustimmungsseite für den OAuth-2.1-Server von Supabase (29.09.2026).
 *
 * Supabase leitet hierher um, wenn claude.ai (oder ein anderer Client) Zugriff
 * auf KerimOS verlangt: /oauth/consent?authorization_id=…
 * Die Middleware sorgt dafür, dass nur ein angemeldeter Benutzer hier landet
 * (sonst /login?next=…). Zustimmen/Ablehnen erledigt Supabase; wir leiten nur
 * auf die zurückgegebene URL weiter.
 */

type Details = {
  authorization_id: string;
  client: { client_name?: string; client_uri?: string; logo_uri?: string; client_id?: string };
  scope: string;
  user?: { email?: string };
};

function Inhalt() {
  const id = useSearchParams().get("authorization_id");
  const [details, setDetails] = useState<Details | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) { setFehler("authorization_id fehlt in der Adresse."); return; }
    const supabase = createClient();
    supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (error) { setFehler(error.message); return; }
      if (!data) { setFehler("Keine Anfrage gefunden."); return; }
      // Schon früher zugestimmt: direkt zurück zum Client.
      if (!("authorization_id" in data)) {
        const ziel = (data as { redirect_url?: string }).redirect_url;
        if (ziel) window.location.href = ziel;
        return;
      }
      setDetails(data as unknown as Details);
    });
  }, [id]);

  async function entscheiden(zustimmen: boolean) {
    if (!id) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = zustimmen
      ? await supabase.auth.oauth.approveAuthorization(id)
      : await supabase.auth.oauth.denyAuthorization(id);
    if (error) { setBusy(false); setFehler(error.message); return; }
    const ziel = (data as { redirect_url?: string } | null)?.redirect_url;
    if (ziel) window.location.href = ziel;
    else { setBusy(false); setFehler("Keine Weiterleitung erhalten."); }
  }

  const name = details?.client.client_name || details?.client.client_id || "Eine Anwendung";

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <Card>
        {fehler ? (
          <p className="text-sm text-bad">{fehler}</p>
        ) : !details ? (
          <p className="text-sm text-ink-muted">Lade Anfrage…</p>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-lg font-semibold text-ink">Zugriff erlauben?</h1>
            <p className="text-sm text-ink-soft">
              <strong>{name}</strong> möchte auf KerimOS zugreifen
              {details.user?.email ? <> als <strong>{details.user.email}</strong></> : null}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>Wochenziele, Routinen, Essen-Notizen, Trades, Backtests und GVA-Status lesen</li>
              <li>Wochenziele anlegen und ändern, Routinen abhaken, Essen-Notizen schreiben</li>
              <li>Nichts löschen, das Trading-Journal nicht ändern</li>
            </ul>
            {details.scope && (
              <p className="text-xs text-ink-faint">Angefragte Scopes: {details.scope}</p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => entscheiden(true)}>
                {busy ? "Moment…" : "Erlauben"}
              </Button>
              <Button className="flex-1" variant="ghost" disabled={busy} onClick={() => entscheiden(false)}>
                Ablehnen
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <Inhalt />
    </Suspense>
  );
}
