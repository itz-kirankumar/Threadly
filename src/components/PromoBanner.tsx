import Link from "next/link";

// Live running promotion strip, rendered above the navbar. The marquee is
// CSS-only, pauses on hover/focus for readability, and is disabled entirely
// under prefers-reduced-motion.
export default function PromoBanner() {
  const text = "Invite-only beta \u00B7 Qualified teams get 200 free credits \u00B7 Request access in one minute \u00B7 ";
  return (
    <div className="relative z-50 overflow-hidden border-b border-amber-300/20 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15">
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
      <Link href="/#early-access" className="block py-2 text-center" aria-label="Request access to the invite-only beta">
        <span className="threadly-promo-track text-xs font-medium tracking-wide text-amber-200 sm:text-sm">
          <span className="px-4">{text}</span>
          <span className="px-4" aria-hidden="true">{text}</span>
        </span>
      </Link>
    </div>
  );
}
