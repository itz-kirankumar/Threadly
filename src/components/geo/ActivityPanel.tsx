"use client";

import { useEffect, useState } from "react";
import type { AuditEntry } from "@/lib/geo/types";

const ACTION_LABELS: Record<string, string> = {
  "question.added": "Question added",
  "question.removed": "Question removed",
  "brand.updated": "Brand profile updated",
  "key.saved": "Provider key saved",
  "key.removed": "Provider key removed",
  "provider.added": "Custom provider added",
  "provider.removed": "Custom provider removed",
  "scan.completed": "Scan completed",
  "invite.created": "Invite link created",
  "member.role_changed": "Member role changed",
  "member.removed": "Member removed",
  "member.left": "Member left",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
};

export default function ActivityPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [entries, setEntries] = useState<AuditEntry[] | "loading" | "error">("loading");

  useEffect(() => {
    authedFetch("/api/geo/audit")
      .then((payload) => setEntries((payload as { entries: AuditEntry[] }).entries))
      .catch(() => setEntries("error"));
  }, [authedFetch]);

  if (entries === "loading") return <p className="text-sm text-zinc-500">Loading activity…</p>;
  if (entries === "error") return <p className="text-sm text-rose-300">Could not load the activity log.</p>;
  if (!entries.length) {
    return <p className="text-sm text-zinc-500">No activity yet. Scans, question changes, key updates and team events are recorded here.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-2.5 font-medium">When</th>
            <th className="px-4 py-2.5 font-medium">Event</th>
            <th className="px-4 py-2.5 font-medium">Actor</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-white/5">
              <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">
                {new Date(entry.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-4 py-2.5 text-zinc-200">{ACTION_LABELS[entry.action] ?? entry.action}</td>
              <td className="px-4 py-2.5 text-zinc-400">{entry.actor}</td>
              <td className="hidden max-w-0 truncate px-4 py-2.5 text-zinc-500 md:table-cell">{entry.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
