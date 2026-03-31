"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizeAccountError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit")) {
    return "Too many email requests. Please wait a few minutes before trying again.";
  }
  return message;
}

async function verifyCurrentPassword(password: string) {
  const supabase = await createClient();
  const nextPassword = password.trim();
  if (!nextPassword) return { ok: false as const, message: "Current password is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false as const, message: "Not authenticated." };

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: nextPassword,
  });
  if (error) return { ok: false as const, message: normalizeAccountError("Current password is incorrect.") };

  return { ok: true as const, supabase, user };
}

export async function updateMyEmailAction(newEmail: string, currentPassword: string) {
  const gate = await verifyCurrentPassword(currentPassword);
  if (!gate.ok) return gate;

  const { supabase, user } = gate;
  const email = newEmail.trim().toLowerCase();
  if (!email) return { ok: false as const, message: "Email is required." };
  if (email === user.email?.toLowerCase()) {
    return { ok: false as const, message: "This is already your current email." };
  }

  try {
    const admin = createServiceRoleClient();
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    if (authErr) return { ok: false as const, message: normalizeAccountError(authErr.message) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { ok: false as const, message: normalizeAccountError(msg) };
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ email })
    .eq("id", user.id);
  if (profileErr) return { ok: false as const, message: normalizeAccountError(profileErr.message) };

  revalidatePath("/account");
  revalidatePath("/team");
  return { ok: true as const, message: "Email updated successfully." };
}

export async function updateMyPasswordAction(currentPassword: string, newPassword: string) {
  const gate = await verifyCurrentPassword(currentPassword);
  if (!gate.ok) return gate;

  const { supabase } = gate;
  const nextPassword = newPassword.trim();
  const prevPassword = currentPassword.trim();
  if (nextPassword.length < 8) {
    return { ok: false as const, message: "Password must be at least 8 characters." };
  }
  if (nextPassword === prevPassword) {
    return { ok: false as const, message: "New password must be different from current password." };
  }

  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) return { ok: false as const, message: normalizeAccountError(error.message) };
  return { ok: true as const, message: "Password updated successfully." };
}
