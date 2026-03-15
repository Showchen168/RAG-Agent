import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ResponsiveLayout } from "@/components/layout/responsive-layout";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?session_expired=1");
  }

  return <ResponsiveLayout>{children}</ResponsiveLayout>;
}
