/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [
      { source: "/:path*", headers: securityHeaders },
      // Firebase auth handler lives on our domain via the rewrites below;
      // its iframe helper must be framable by our own pages.
      {
        source: "/__/auth/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  async redirects() {
    // Invite-only: packs are bought inside the workspace after onboarding.
    return [{ source: "/checkout", destination: "/#early-access", permanent: false }];
  },
  async rewrites() {
    // Custom Firebase authDomain: serve the auth handler same-origin so
    // popup and redirect sign-in survive third-party storage blocking.
    return [
      { source: "/__/auth/:path*", destination: "https://wisentry-510811.firebaseapp.com/__/auth/:path*" },
      { source: "/__/firebase/:path*", destination: "https://wisentry-510811.firebaseapp.com/__/firebase/:path*" },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
};

export default nextConfig;
