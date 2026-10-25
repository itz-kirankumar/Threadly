import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live"),
  title: {
    default: "Threadly — Enterprise Generative Engine Optimization (GEO)",
    template: "%s · Threadly Enterprise",
  },
  description:
    "Enterprise GEO Platform: Monitor brand recommendations, citation share, and competitor displacement across ChatGPT, Perplexity, Gemini, and Claude.",
  applicationName: "Threadly Enterprise GEO",
  keywords: [
    "enterprise geo",
    "generative engine optimization",
    "ai answer share",
    "chatgpt brand tracking",
    "perplexity citations",
    "llm answer intelligence",
    "ai share of voice",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/threadly-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "Threadly — Enterprise Generative Engine Optimization (GEO)",
    description:
      "Monitor brand recommendations, citation share, and competitor displacement across ChatGPT, Perplexity, Gemini, and Claude.",
    siteName: "Threadly Enterprise GEO",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Threadly Enterprise GEO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadly — Enterprise Generative Engine Optimization (GEO)",
    description:
      "Monitor brand recommendations, citation share, and competitor displacement across ChatGPT, Perplexity, Gemini, and Claude.",
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
    name: "Threadly Enterprise GEO",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "1500",
      priceCurrency: "USD",
    },
    description:
      "Enterprise GEO Platform: Monitor brand recommendations, citation share, and competitor displacement across ChatGPT, Perplexity, Gemini, and Claude.",
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
        className={`${inter.variable} ${mono.variable} font-sans antialiased bg-[#07090e] text-[#f0f3f8]`}
      >
        {children}
      </body>
    </html>
  );
}
