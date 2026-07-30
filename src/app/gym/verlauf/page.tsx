import { GymHistory } from "@/components/gym-history";
import { Empty } from "@/components/ui";
import { gymConfigured, fetchHistory } from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

export default async function GymVerlaufPage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  const sessions = await fetchHistory(40);
  return <GymHistory sessions={sessions} />;
}
