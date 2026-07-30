import { ShoppingList } from "@/components/shopping-list";
import { Empty } from "@/components/ui";
import { createMenuClient, type ShoppingItem } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function EssenEinkaufPage() {
  const menu = createMenuClient();
  if (!menu) return <Empty>Menü-Datenbank nicht verbunden.</Empty>;

  const { data } = await menu.from("shopping_list")
    .select("id, item, quantity, checked")
    .order("checked").order("created_at", { ascending: false });

  return <ShoppingList items={(data ?? []) as ShoppingItem[]} />;
}
