import EnterpriseGeoDashboard from "@/components/EnterpriseGeoDashboard";

export const metadata = {
  title: "Enterprise GEO Command Center · Threadly",
  description: "Monitor AI answer share, citation footprints, and competitor displacement across ChatGPT, Perplexity, Gemini, and Claude.",
};

export default function PortalPage() {
  return <EnterpriseGeoDashboard initialBrand="stripe" />;
}
