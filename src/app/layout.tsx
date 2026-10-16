import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Wisentry - Get Your First 1000 Real Users",
  description: "Wisentry helps B2C startups get real leads and users insights across social media.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.jpg", type: "image/jpeg" }],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${inter.variable} font-sans antialiased bg-white text-gray-900`}>
        {children}
      </body>
    </html>
  );
}
