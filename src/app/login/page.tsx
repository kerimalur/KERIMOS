"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const supabase = createClient();

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (result.error) { setError(result.error.message); return; }
    if (mode === "signup" && !result.data.session) {
      setMessage("Konto angelegt. Bitte bestätige die E-Mail und melde dich dann an.");
      setMode("signin");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent text-lg font-bold text-white">
          K
        </div>
        <h1 className="text-xl font-semibold text-ink">KerimOS</h1>
        <p className="mt-1 text-sm text-ink-muted">Zeit, Geld und Ziele an einem Ort.</p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" required minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}
          {message && <p className="text-sm text-good">{message}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Moment…" : mode === "signin" ? "Anmelden" : "Konto anlegen"}
          </Button>
        </form>

        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="mt-4 w-full text-center text-xs text-ink-muted transition hover:text-ink-soft"
        >
          {mode === "signin" ? "Noch kein Konto? Registrieren" : "Zurück zur Anmeldung"}
        </button>
      </Card>
    </div>
  );
}
