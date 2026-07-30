import { GymBalance } from "@/components/gym-balance";
import { Empty } from "@/components/ui";
import { gymConfigured, fetchMuscleBalance } from "@/lib/supabase/gym";

export const dynamic = "force-dynamic";

export default async function GymBalancePage() {
  if (!gymConfigured()) return <Empty>Gym-Datenbank nicht verbunden.</Empty>;

  // Alle drei Zeiträume vorladen - das Umschalten soll ohne Nachladen gehen
  const [vier, acht, zwoelf] = await Promise.all([
    fetchMuscleBalance(28),
    fetchMuscleBalance(56),
    fetchMuscleBalance(84),
  ]);

  return <GymBalance vier={vier} acht={acht} zwoelf={zwoelf} />;
}
