import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "@/components/team/TeamClient";
import type { Profile } from "@/types/database";
import { LOGIN_GATE_KEY } from "@/lib/loginGate";

export default async function TeamPage() {
  const supabase = await createClient();
  const [{ data }, { data: gate }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("app_settings").select("key").eq("key", LOGIN_GATE_KEY).maybeSingle(),
  ]);

  return <TeamClient members={(data ?? []) as Profile[]} loginGateEnabled={Boolean(gate)} />;
}
