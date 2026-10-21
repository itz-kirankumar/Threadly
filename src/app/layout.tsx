import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "Threadly — The Growth Operating System",
    template: "%s · Threadly",
  },
  description:
    "Threadly turns real market conversations into revenue. Find high-intent leads, run multi-step outreach, optimize ad spend, schedule content at the right moment, and rank in search and AI answers — from one live workspace.",
  applicationName: "Threadly",
  keywords: [
    "growth operating system",
    "lead generation",
    "outreach automation",
    "campaign optimization",
    "generative engine optimization",
    "content scheduling",
    "revenue analytics",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/threadly-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "Threadly — The Growth Operating System",
    description:
      "Lead gen, outreach, campaigns, scheduling, analytics and GEO in one live workspace.",
    siteName: "Threadly",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadly — The Growth Operating System",
    description:
      "Lead gen, outreach, campaigns, scheduling, analytics and GEO in one live workspace.",
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
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "The growth operating system for founders: real-time lead discovery across Reddit, Hacker News, X, autonomous scoring, humanized outbound sequences, and revenue analytics.",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "128",
    },
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
