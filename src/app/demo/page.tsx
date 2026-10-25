import EnterpriseGeoDashboard from "@/components/EnterpriseGeoDashboard";

export const metadata = {
  title: "Enterprise GEO Interactive Demo · Threadly",
  description: "Live interactive demo of Threadly Enterprise GEO Intelligence Platform.",
};

export default function DemoPage() {
  return (
    <div>
      <div className="bg-gradient-to-r from-amber-500/20 via-[#ff4500]/20 to-purple-500/20 border-b border-white/10 px-4 py-2 text-center text-xs font-mono text-amber-300">
        ⚡ <strong>ENTERPRISE GEO LIVE DEMO</strong> — Showing real-time generative answer share and citation analytics for enterprise SaaS.
      </div>
      <EnterpriseGeoDashboard initialBrand="stripe" />
    </div>
  );
}
