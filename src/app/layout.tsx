import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const description =
  "Threadly is the enterprise GEO intelligence platform: monitor brand mentions and citation share across ChatGPT, Claude, Gemini and Perplexity.";

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
    "Perplexity",
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
    images: [{ url: "/logo.png", width: 1200, height: 630, alt: "Threadly GEO Intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadly — Enterprise GEO Intelligence",
    description,
    images: ["/logo.png"],
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
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
