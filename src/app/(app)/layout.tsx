import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { TabletShell } from "@/components/layout/TabletShell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  if (profile.is_active === false) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=account_disabled");
  }

  return <TabletShell profile={profile}>{children}</TabletShell>;
}
