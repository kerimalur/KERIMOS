import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "KerimOS",
  description: "Zeit, Geld und Ziele an einem Ort.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="de-CH">
      <body className="min-h-screen">
        {user && <Nav email={user.email ?? undefined} />}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
