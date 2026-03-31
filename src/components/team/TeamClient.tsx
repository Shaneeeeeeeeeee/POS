"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  clearLoginAccessCodeAction,
  createTeamMemberAction,
  getLoginAccessCodeAction,
  resetMemberPasswordToDefaultAction,
  setLoginAccessCodeAction,
  setMemberActiveAction,
  updateMemberRoleAction,
} from "@/app/actions/team";
import type { Profile, Role } from "@/types/database";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SearchField } from "@/components/ui/SearchField";

const roles: Role[] = ["admin", "manager", "staff"];

type MemberFilter = "all" | "active" | "inactive";

const label = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]";

export function TeamClient({
  members,
  loginGateEnabled,
}: {
  members: Profile[];
  loginGateEnabled: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [accessCode, setAccessCode] = useState("");
  const [revealedCode, setRevealedCode] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const active = m.is_active !== false;
      if (memberFilter === "active" && !active) return false;
      if (memberFilter === "inactive" && active) return false;
      if (!q) return true;
      const name = (m.full_name ?? "").toLowerCase();
      const email = m.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, search, memberFilter]);

  return (
    <div className="space-y-8 tablet:space-y-10">
      <PageHeader
        eyebrow="Access"
        title="Team & accounts"
        description="Add staff, assign roles, and deactivate accounts without deleting history. Inactive users cannot sign in to this POS."
      />

      {msg ? (
        <p className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream-deep)] px-4 py-3 text-sm text-[var(--foreground)]">
          {msg}
        </p>
      ) : null}

      <Panel title="Add team member">
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Creates a Supabase Auth login and profile. Share the password with the teammate securely.
        </p>
        <form
          className="grid gap-4 tablet:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              setMsg(null);
              const r = await createTeamMemberAction(fd);
              setMsg(r.ok ? "User created. They can sign in immediately." : r.message);
              if (r.ok) {
                e.currentTarget.reset();
                router.refresh();
              }
            });
          }}
        >
          <div>
            <label className={label}>Email</label>
            <input name="email" type="email" required className="input-field" placeholder="name@store.com" />
          </div>
          <div>
            <label className={label}>Temporary password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input-field"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label className={label}>Display name (optional)</label>
            <input name="full_name" type="text" className="input-field" placeholder="Maria Santos" />
          </div>
          <div>
            <label className={label}>Role</label>
            <select name="role" className="input-field" defaultValue="staff">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="tablet:col-span-2">
            <button type="submit" disabled={pending} className="btn-primary px-6">
              {pending ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Login access code gate">
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Require a code before users can access the login form. Set this before going live.
        </p>
        <div className="mb-3 inline-flex rounded-full bg-[rgba(15,68,21,0.08)] px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
          Status: {loginGateEnabled ? "Enabled" : "Disabled"}
        </div>
        {revealedCode ? (
          <p className="mb-3 rounded-lg border border-[rgba(15,68,21,0.12)] bg-white px-3 py-2 text-sm text-[var(--foreground)]">
            Current access code: <span className="font-mono font-semibold">{revealedCode}</span>
          </p>
        ) : null}
        <form
          className="flex flex-col gap-3 tablet:flex-row tablet:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setMsg(null);
              const r = await setLoginAccessCodeAction(accessCode);
              setMsg(r.message);
              if (r.ok) {
                setAccessCode("");
                router.refresh();
              }
            });
          }}
        >
          <div className="flex-1">
            <label className={label}>Access code</label>
            <input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              type="password"
              className="input-field"
              minLength={4}
              required
              placeholder="Enter new gate code"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary px-6">
            {pending ? "Saving..." : "Save code"}
          </button>
          {loginGateEnabled ? (
            <button
              type="button"
              disabled={pending}
              className="btn-secondary px-6"
              onClick={() => {
                start(async () => {
                  setMsg(null);
                  const r = await getLoginAccessCodeAction();
                  if (!r.ok) {
                    setMsg(r.message);
                    return;
                  }
                  setRevealedCode(r.code);
                  setMsg("Access code revealed.");
                });
              }}
            >
              View code
            </button>
          ) : null}
          {loginGateEnabled ? (
            <button
              type="button"
              disabled={pending}
              className="btn-secondary px-6"
              onClick={() => {
                const ok = window.confirm(
                  "Delete access code and disable login gate? Users will be able to open login directly."
                );
                if (!ok) return;
                start(async () => {
                  setMsg(null);
                  const r = await clearLoginAccessCodeAction();
                  setMsg(r.message);
                  if (r.ok) {
                    setRevealedCode(null);
                    router.refresh();
                  }
                });
              }}
            >
              Delete code / Disable gate
            </button>
          ) : null}
        </form>
      </Panel>

      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search name or email…"
          className="w-full tablet:max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["inactive", "Inactive"],
            ] as const
          ).map(([key, lab]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMemberFilter(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                memberFilter === key
                  ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)]"
                  : "bg-[var(--color-surface-solid)] text-[var(--foreground)] ring-1 ring-[rgba(15,68,21,0.1)]"
              }`}
            >
              {lab}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-3">
        {filtered.map((m) => {
          const active = m.is_active !== false;
          return (
            <li
              key={m.id}
              className="flex flex-col gap-4 rounded-[var(--radius-2xl)] border border-white/80 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] backdrop-blur-xl tablet:flex-row tablet:flex-wrap tablet:items-center tablet:justify-between tablet:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-[var(--foreground)]">{m.full_name || m.email}</p>
                  {!active ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                      Inactive
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--foreground-muted)]">{m.email}</p>
              </div>
              <label className="flex flex-col gap-1 text-sm tablet:flex-row tablet:items-center tablet:gap-3">
                <span className="shrink-0 font-semibold text-[var(--foreground-muted)]">Role</span>
                <select
                  className="input-field min-w-[10rem] py-2.5"
                  defaultValue={m.role}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    start(async () => {
                      setMsg(null);
                      const r = await updateMemberRoleAction(m.id, role);
                      setMsg(r.ok ? "Role updated." : r.message);
                      if (r.ok) router.refresh();
                    });
                  }}
                  disabled={pending || !active}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 border-t border-[rgba(15,68,21,0.08)] pt-4 tablet:border-0 tablet:pt-0">
                <span className="text-sm font-semibold text-[var(--foreground-muted)]">Access</span>
                <button
                  type="button"
                  disabled={pending}
                  role="switch"
                  aria-checked={active}
                  onClick={() => {
                    start(async () => {
                      setMsg(null);
                      const r = await setMemberActiveAction(m.id, !active);
                      setMsg(
                        r.ok
                          ? !active
                            ? "Account activated."
                            : "Account deactivated — they can no longer use the POS."
                          : r.message
                      );
                      if (r.ok) router.refresh();
                    });
                  }}
                  className={`relative h-9 w-[3.25rem] shrink-0 rounded-full transition ${
                    active ? "bg-[var(--color-primary-bright)]" : "bg-[var(--foreground-muted)]/35"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow-md transition ${
                      active ? "left-7" : "left-1"
                    }`}
                  />
                </button>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {active ? "Can sign in" : "Blocked"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const ok = window.confirm(
                      `Reset password for ${m.full_name || m.email} to the default password?`
                    );
                    if (!ok) return;
                    start(async () => {
                      setMsg(null);
                      const r = await resetMemberPasswordToDefaultAction(m.id);
                      setMsg(r.ok ? r.message : r.message);
                      if (r.ok) router.refresh();
                    });
                  }}
                  className="btn-secondary !min-h-9 !px-3 !text-xs"
                >
                  Reset password
                </button>
              </div>
            </li>
          );
        })}
        {members.length === 0 ? (
          <li className="rounded-[var(--radius-2xl)] border border-dashed border-[rgba(15,68,21,0.2)] bg-[rgba(15,68,21,0.02)] p-10 text-center text-sm text-[var(--foreground-muted)]">
            No team members yet. Add one above or run the seed script.
          </li>
        ) : filtered.length === 0 ? (
          <li className="rounded-[var(--radius-2xl)] border border-dashed border-[rgba(15,68,21,0.2)] p-8 text-center text-sm text-[var(--foreground-muted)]">
            No matches. Try another search or filter.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
