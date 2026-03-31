import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export default async function Home() {
  if (!getSupabaseUrl() || !getSupabasePublishableKey()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/pos");
  redirect("/login");
}
