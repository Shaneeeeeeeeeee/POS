"use client";

import { useState, useTransition } from "react";
import { updateMyEmailAction, updateMyPasswordAction } from "@/app/actions/account";
import type { Profile } from "@/types/database";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";

const label = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]";

export function AccountClient({ profile }: { profile: Profile }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(profile.email);
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <div className="space-y-8 tablet:space-y-10">
      <PageHeader
        eyebrow="Profile"
        title="My Account"
        description="Manage your email and password. Use a strong password and keep your credentials private."
      />

      {msg ? (
        <p className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream-deep)] px-4 py-3 text-sm text-[var(--foreground)]">
          {msg}
        </p>
      ) : null}

      <Panel title="Email">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setMsg(null);
              const r = await updateMyEmailAction(email, emailCurrentPassword);
              setMsg(r.message);
              if (r.ok) setEmailCurrentPassword("");
            });
          }}
        >
          <div>
            <label className={label}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className={label}>Current password</label>
            <input
              type="password"
              required
              value={emailCurrentPassword}
              onChange={(e) => setEmailCurrentPassword(e.target.value)}
              className="input-field"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary px-6">
            {pending ? "Saving..." : "Update email"}
          </button>
        </form>
      </Panel>

      <Panel title="Password">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== confirmPassword) {
              setMsg("Passwords do not match.");
              return;
            }
            start(async () => {
              setMsg(null);
              const r = await updateMyPasswordAction(currentPassword, password);
              setMsg(r.message);
              if (r.ok) {
                setCurrentPassword("");
                setPassword("");
                setConfirmPassword("");
              }
            });
          }}
        >
          <div>
            <label className={label}>Current password</label>
            <input
              type="password"
              required
              minLength={8}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input-field"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className={label}>New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={label}>Confirm password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary px-6">
            {pending ? "Saving..." : "Change password"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
