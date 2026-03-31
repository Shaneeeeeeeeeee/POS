"use server";

import { cookies } from "next/headers";
import { getLoginGateHash, hashAccessCode, LOGIN_GATE_COOKIE } from "@/lib/loginGate";

export async function verifyLoginAccessCodeAction(code: string) {
  const raw = code.trim();
  if (!raw) return { ok: false as const, message: "Access code is required." };

  const savedHash = await getLoginGateHash();
  if (!savedHash) return { ok: true as const };

  const passed = hashAccessCode(raw) === savedHash;
  if (!passed) return { ok: false as const, message: "Invalid access code." };

  const cookieStore = await cookies();
  cookieStore.set(LOGIN_GATE_COOKIE, savedHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true as const };
}
