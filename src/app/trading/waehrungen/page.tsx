import { redirect } from "next/navigation";
import { G8 } from "@/lib/supabase/trading";

/**
 * Die alte Währungsübersicht gibt es nicht mehr (26.09.2026): es gibt nur
 * noch die Seite je Währung, nach Kerims drei Ebenen aufgebaut. Wer hier
 * landet — Navigation, alte Lesezeichen, `?w=EUR` —, wird weitergeleitet.
 */
export default async function Waehrungen({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const w = ((await searchParams).w ?? "").toUpperCase();
  redirect(`/trading/waehrungen/${(G8 as readonly string[]).includes(w) ? w : "USD"}`);
}
