import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Profile } from "@/types/database";

export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!getSupabaseUrl() || !getSupabasePublishableKey()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
});
