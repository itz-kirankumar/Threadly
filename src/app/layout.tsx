import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });

const description =
  "Threadly is the enterprise GEO intelligence platform: monitor brand mentions and citation share across ChatGPT, Claude and Gemini.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live"),
  title: {
    default: "Threadly — Enterprise GEO Intelligence",
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
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/threadly-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "Threadly — Enterprise GEO Intelligence",
    description,
    siteName: "Threadly",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Threadly — when buyers ask AI, does it mention you?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadly — Enterprise GEO Intelligence",
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
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free while in early access" },
  };
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <body className="font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        <CookieConsent />
        <Analytics />
        {/* Microsoft Clarity (project z3bzd50bsc) - visit analytics for the
            Shipped course tracking receipt. Public project id, not a secret. */}
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "z3bzd50bsc");`,
          }}
        />
      </body>
    </html>
  );
}
