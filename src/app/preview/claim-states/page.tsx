import type { Metadata } from "next";
import ClaimView from "@/components/ClaimView";

export const metadata: Metadata = {
  title: "Claim UI preview",
  robots: { index: false, follow: false },
};

// Static fixtures for visual verification of the claim flow's states without
// needing a real payment. Unlinked and noindexed; renders no live data.
const STATES: { label: string; props: Parameters<typeof ClaimView>[0] }[] = [
  { label: "1 - signed out (one last step)", props: { status: "signin" } },
  { label: "2 - linking in progress", props: { status: "working" } },
  {
    label: "3 - error: contact mismatch paused",
    props: {
      status: "error",
      message: "The mobile number on the payment does not match this account, so the claim is paused for review - no entitlement was granted. Reference clm_preview0001 at hello@gothreadly.live.",
      claimRef: "clm_preview0001",
    },
  },
  {
    label: "4 - error: existing plan, captured/unclaimed",
    props: {
      status: "error",
      message: "This account already has an active plan, so the purchase was not attached. The payment was captured and the purchase remains unclaimed - no second charge happened. Reconciliation is pending: contact hello@gothreadly.live with reference clm_preview0002.",
      claimRef: "clm_preview0002",
    },
  },
  { label: "5 - done", props: { status: "done", plan: "pro", periodEnd: "2027-10-26T00:00:00.000Z", email: "person@example.com" } },
];

export default function ClaimStatesPreview() {
  return (
    <div className="divide-y divide-zinc-800">
      <p className="bg-amber-500/10 px-6 py-2 text-center text-xs text-amber-200">
        UI preview fixtures - no live data, no actions.
      </p>
      {STATES.map((s) => (
        <section key={s.label}>
          <p className="bg-zinc-900 px-6 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
          <ClaimView {...s.props} />
        </section>
      ))}
    </div>
  );
}
