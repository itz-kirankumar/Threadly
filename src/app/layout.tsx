import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live"),
  title: {
    default: "Signal Radar by Threadly — Find High-Intent Buyers on X & Reddit",
    template: "%s · Threadly",
  },
  description: "Signal Radar by Threadly finds buyers who are already describing your product's problem on X, Reddit and communities — before your competitors see the thread.",
  applicationName: "Threadly",
  keywords: [
    "signal radar",
    "social listening",
    "intent discovery",
    "lead generation",
    "outreach automation",
    "reddit leads",
    "x buying signals",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/threadly-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "Signal Radar by Threadly — Find High-Intent Buyers on X & Reddit",
    description: "Find buyers who are already describing your product's problem on X, Reddit and communities.",
    siteName: "Threadly",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Threadly Signal Radar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal Radar by Threadly — Find High-Intent Buyers on X & Reddit",
    description: "Find buyers who are already describing your product's problem on X, Reddit and communities.",
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
    name: "Threadly Signal Radar",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: "Signal Radar finds buyers who are already describing your product's problem on X, Reddit and communities — before your competitors see the thread.",
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${mono.variable} font-sans antialiased bg-brand-paper text-brand-black`}
      >
        {children}
      </body>
    </html>
  );
}
