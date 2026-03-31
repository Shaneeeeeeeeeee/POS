"use client";

import { useState, useTransition } from "react";
import { verifyLoginAccessCodeAction } from "@/app/actions/loginGate";

export function LoginAccessGate() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMsg(null);
          const res = await verifyLoginAccessCodeAction(code);
          if (!res.ok) {
            setMsg(res.message);
            return;
          }
          window.location.reload();
        });
      }}
    >
      {msg ? (
        <p className="rounded-[var(--radius-xl)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {msg}
        </p>
      ) : null}
      <p className="text-sm text-[var(--foreground-muted)]">
        Enter the access code provided by your administrator before sign-in.
      </p>
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
          Access code
        </label>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="w-full rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] px-4 py-3.5 text-[var(--foreground)] shadow-[var(--shadow-sm)] focus:border-[var(--color-primary-bright)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
          placeholder="Enter access code"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex w-full min-h-[54px] items-center justify-center rounded-[var(--radius-xl)] bg-gradient-to-r from-[#0f4415] to-[#134919] text-base font-bold tracking-wide text-[var(--color-cream-deep)] shadow-[0_8px_28px_rgba(15,68,21,0.3)] transition hover:brightness-[1.06] disabled:opacity-55"
      >
        {pending ? "Verifying..." : "Continue"}
      </button>
    </form>
  );
}
