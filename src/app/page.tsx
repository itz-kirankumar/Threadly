import LandingClient from "@/components/LandingClient";
import LandingLenisProvider from "@/components/LandingLenisProvider";
import ScrollProgressIndicator from "@/components/ScrollProgressIndicator";

export default function Home() {
  return (
    <LandingLenisProvider>
      <ScrollProgressIndicator />
      <main className="min-h-screen bg-white selection:bg-brand-electric selection:text-white">
        <LandingClient />
      </main>
    </LandingLenisProvider>
  );
}
