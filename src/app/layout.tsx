import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import PostHogProvider from "@/components/PostHogProvider";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import PublicAssistant from "@/components/assistant/PublicAssistant";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });

const description =
  "Threadly is a private, invitation-only prospecting and AI visibility platform for eligible B2B teams.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live"),
  title: {
    default: "Threadly — Pipeline, by invitation",
    template: "%s · Threadly",
  },
  description,
  applicationName: "Threadly",
  keywords: [
    "GEO",
    "generative engine optimization",
    "AI visibility",
    "brand monitoring",
    "ChatGPT mentions",
    "citation share",
    "share of voice",
    "Claude",
    "Gemini",
  ],
  icons: {
    icon: [
      // Raster PNGs at 48px multiples: Google's favicon crawler does not
      // reliably pick up SVG-only icon sets.
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "Threadly — Pipeline, by invitation",
    description,
    siteName: "Threadly",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Threadly — Pipeline, by invitation" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadly — Pipeline, by invitation",
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Threadly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description,
    offers: { "@type": "Offer", price: "7", priceCurrency: "USD", description: "7-day trial, one-time payment" },
  };
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <body className="font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        <CookieConsent />
        <Analytics />
        <PostHogProvider />
        {/* Microsoft Clarity (project z3bzd50bsc) - visit analytics for the
            Shipped course tracking receipt. Public project id, not a secret. */}
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "z3bzd50bsc");`,
          }}
        />
        <PublicAssistant />
      </body>
    </html>
  );
}
