import { Card, CardTitle, Empty } from "@/components/ui";

/**
 * Eine Meldung für den Fall, dass die Trading-Datenbank fehlt oder kein
 * Benutzer gefunden wurde — statt sieben Seiten mit demselben Text.
 */
export function JournalHinweis({ grund }: { grund: "keine-db" | "kein-user" }) {
  return (
    <Card>
      <CardTitle>Journal noch nicht verbunden</CardTitle>
      {grund === "keine-db" ? (
        <Empty>
          Die Trading-Datenbank ist nicht eingerichtet. In{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">.env.local</code>{" "}
          und in Vercel fehlen{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">TRADING_SUPABASE_URL</code>{" "}
          und{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">
            TRADING_SUPABASE_SERVICE_ROLE_KEY
          </code>
          .
        </Empty>
      ) : (
        <Empty>
          Die Datenbank antwortet, enthält aber noch keinen Benutzer, dem
          Trades gehören könnten. Trag deine User-ID aus dem Supabase-Projekt
          (Authentication → Users) als{" "}
          <code className="rounded bg-sand px-1 py-0.5 text-xs">TRADING_USER_ID</code>{" "}
          ein — dann weiss KerimOS, unter wessen Namen es schreibt.
        </Empty>
      )}
    </Card>
  );
}
