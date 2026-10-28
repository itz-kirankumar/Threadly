import { notFound } from "next/navigation";
import OutboundPreviewClient from "./OutboundPreviewClient";

export const dynamic = "force-dynamic";

// LOCAL DEVELOPMENT PREVIEW ONLY. Rendered solely when ENABLE_DEMO_MODE=true
// (never set in production): shows the Enterprise outbound panel against
// in-memory SYNTHETIC fixtures so UI changes can be pixel-checked without a
// backend. Fixtures are mock data - no real tenant records, no sends.
export default function OutboundPreviewPage() {
  if (process.env.ENABLE_DEMO_MODE !== "true") notFound();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Demo preview - all data below is synthetic mock data for UI review. Nothing is real, nothing sends.
      </p>
      <OutboundPreviewClient />
    </main>
  );
}
