"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    errParam === "account_disabled"
      ? "This account has been deactivated. Contact an administrator."
      : errParam
        ? "Authentication failed."
        : ""
  );
  const [loading, setLoading] = useState(false);

  const configured =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    (Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length) ||
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.length));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!configured) {
      setError("Supabase environment variables are not set.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    router.replace("/pos");
    router.refresh();
  }

  if (!configured) {
    return (
      <p className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream-deep)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
        Copy <code className="font-mono text-xs">.env.local.example</code> to{" "}
        <code className="font-mono text-xs">.env.local</code> and add your Supabase project URL and
        public key.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <p
          className="rounded-[var(--radius-xl)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] px-4 py-3.5 text-[var(--foreground)] shadow-[var(--shadow-sm)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--color-primary-bright)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
          placeholder="you@store.com"
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] px-4 py-3.5 pr-12 text-[var(--foreground)] shadow-[var(--shadow-sm)] focus:border-[var(--color-primary-bright)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-[var(--foreground-muted)] transition hover:bg-[rgba(15,68,21,0.06)] hover:text-[var(--foreground)]"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full min-h-[54px] items-center justify-center rounded-[var(--radius-xl)] bg-gradient-to-r from-[#0f4415] to-[#134919] text-base font-bold tracking-wide text-[var(--color-cream-deep)] shadow-[0_8px_28px_rgba(15,68,21,0.3)] transition hover:brightness-[1.06] disabled:opacity-55"
      >
        {loading ? "Signing in…" : "Continue to POS"}
      </button>
    </form>
  );
}
