"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "owner" | "admin" | "member";

interface Member {
  uid: string;
  email: string;
  name: string;
  role: Role;
  addedAt: string;
}

interface Invite {
  token: string;
  role: Role;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

interface TeamState {
  teamsEnabled: boolean;
  role: Role;
  shared: boolean;
  owner: Member | null;
  members: Member[];
  invites: Invite[];
}

const ROLE_LABELS: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_STYLES: Record<Role, string> = {
  owner: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  admin: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  member: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

function inviteUrl(token: string): string {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${token}`;
}

export default function TeamPanel({
  authedFetch,
  currentUid,
}: {
  authedFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  currentUid: string;
}) {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      setTeam((await authedFetch("/api/geo/team")) as TeamState);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the team.");
    }
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, okMessage?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (okMessage) setNotice(okMessage);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Copy failed - select and copy the link manually.");
    }
  }

  if (!team) {
    return <p className="text-sm text-zinc-500">Loading team...</p>;
  }

  if (!team.teamsEnabled) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-base font-semibold text-white">Team</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Team sharing is rolling out to this deployment. Once it is on, you can invite your whole company with one
          link and manage roles here.
        </p>
      </div>
    );
  }

  const canManage = team.role === "owner" || team.role === "admin";
  const everyone: Member[] = team.shared
    ? [...(team.owner ? [team.owner] : []), ...team.members]
    : team.members;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Team</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {team.shared ? "You joined this workspace" : "People with access to this workspace"} · your role:{" "}
            <span className="font-medium text-zinc-300">{ROLE_LABELS[team.role]}</span>
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-200">{notice}</p>}

      {/* Invite links */}
      {canManage && (
        <div className="rounded-xl border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-white">Invite links</p>
              <p className="mt-0.5 text-xs text-zinc-500">One link onboards your whole company. Links expire after 7 days.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => authedFetch("/api/geo/team/invite", { method: "POST", body: JSON.stringify({ role: inviteRole }) }), "Invite link created.")}
                className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-60"
              >
                Create invite link
              </button>
            </div>
          </div>
          {team.invites.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500">No active invite links. Create one and share it anywhere.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {team.invites.map((invite) => (
                <li key={invite.token} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-zinc-300">{inviteUrl(invite.token)}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {ROLE_LABELS[invite.role]} access · by {invite.createdByName} · expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(invite.token)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06]"
                  >
                    {copied === invite.token ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => authedFetch("/api/geo/team/invite", { method: "DELETE", body: JSON.stringify({ token: invite.token }) }), "Invite revoked.")}
                    className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Members */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm font-medium text-white">Members</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Owners and admins manage brand, keys and team. Members track questions and run scans.
          </p>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {team.shared && (
            <li className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-200">
                {(team.owner?.name || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{team.owner?.name || "Workspace owner"}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${ROLE_STYLES.owner}`}>Owner</span>
            </li>
          )}
          {everyone.length === 0 && !team.shared && (
            <li className="px-5 py-4 text-sm text-zinc-500">Just you so far - share an invite link to add your team.</li>
          )}
          {everyone
            .filter((member) => member.role !== "owner")
            .map((member) => (
              <li key={member.uid} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-300">
                  {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {member.name || member.email}
                    {member.uid === currentUid && <span className="ml-1.5 text-xs text-zinc-500">(you)</span>}
                  </p>
                  {member.email && member.name && <p className="truncate text-xs text-zinc-500">{member.email}</p>}
                </div>
                {team.role === "owner" && member.uid !== currentUid ? (
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(event) =>
                      act(
                        () =>
                          authedFetch("/api/geo/team/members", {
                            method: "PATCH",
                            body: JSON.stringify({ uid: member.uid, role: event.target.value }),
                          }),
                        "Role updated.",
                      )
                    }
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 disabled:opacity-60"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${ROLE_STYLES[member.role]}`}>
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
                {member.uid === currentUid && team.shared ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => authedFetch("/api/geo/team/members", { method: "DELETE", body: JSON.stringify({}) }), "You left the workspace.")}
                    className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Leave
                  </button>
                ) : canManage && member.uid !== currentUid ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => authedFetch("/api/geo/team/members", { method: "DELETE", body: JSON.stringify({ uid: member.uid }) }),
                        "Member removed.",
                      )
                    }
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      </div>

      {/* Role guide */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">What roles can do</p>
        <div className="mt-3 grid gap-3 text-xs leading-relaxed text-zinc-400 sm:grid-cols-3">
          <div>
            <p className="font-medium text-zinc-200">Owner</p>
            <p className="mt-1">Everything: brand, keys, scans, roles, invites, removing anyone.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-200">Admin</p>
            <p className="mt-1">Brand profile, provider keys, questions, scans, invite links, removing members.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-200">Member</p>
            <p className="mt-1">View all results, add questions, run scans. Cannot touch brand, keys or team.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
