import Link from "next/link";

// Live running promotion strip, rendered above the navbar. The marquee is
// CSS-only, pauses on hover/focus for readability, and is disabled entirely
// under prefers-reduced-motion.
export default function PromoBanner() {
  const text = "Invite-only \u00B7 Qualified teams get free credits and double credits on their first pack \u00B7 Check your eligibility in one minute \u00B7 ";
  return (
    <div className="relative z-50 overflow-hidden border-b border-violet-400/20 bg-gradient-to-r from-violet-700 via-fuchsia-700 to-violet-700">
      <style>{`
        @keyframes threadly-promo-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .threadly-promo-track {
          display: inline-flex;
          white-space: nowrap;
          animation: threadly-promo-marquee 22s linear infinite;
        }
        .threadly-promo-track:hover, .threadly-promo-track:focus-within { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .threadly-promo-track { animation: none; white-space: normal; }
        }
      `}</style>
      <Link href="/#early-access" className="block py-2 text-center" aria-label="Check your eligibility for Threadly">
        <span className="threadly-promo-track text-xs font-medium tracking-wide text-violet-50 sm:text-sm">
          <span className="px-4">{text}</span>
          <span className="px-4" aria-hidden="true">{text}</span>
        </span>
      </Link>
    </div>
  );
}
