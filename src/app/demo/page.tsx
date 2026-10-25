import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GeoDashboard from "@/components/geo/GeoDashboard";
import { buildDemoRunDetails, buildDemoWorkspace } from "@/lib/geo/demo";

export const metadata = {
  title: "Live demo",
  description: "A read-only Threadly GEO workspace with sample data - no sign-in required.",
};

export default function DemoPage() {
  const state = buildDemoWorkspace();
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-grow px-6 py-10">
        <GeoDashboard user={null} readOnly initialState={state} demoRunDetails={buildDemoRunDetails()} />
      </main>
      <Footer />
    </div>
  );
}
