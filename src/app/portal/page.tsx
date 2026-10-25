import PortalNav from "@/components/PortalNav";
import PortalGate from "@/components/PortalGate";

export default function PortalPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <PortalNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <PortalGate />
      </main>
    </div>
  );
}
