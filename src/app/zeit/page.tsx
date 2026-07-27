import { redirect } from "next/navigation";

/** Der Zeit-Bereich beginnt im Tageskalender - dort wird auch erfasst. */
export default function ZeitPage() {
  redirect("/kalender?ansicht=tag");
}
