// The Threadly seal: one unbroken thread drawn as a T inside a fine gold
// ring, finished with a violet knot. Keep in step with public/threadly-mark.svg.
export default function ThreadlyLogo({ size = 28, wordmark = false, className = "" }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="Threadly">
        <defs>
          <linearGradient id="threadly-gold" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f5e6bd" />
            <stop offset="0.5" stopColor="#D8B982" />
            <stop offset="1" stopColor="#a67c32" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29.5" stroke="url(#threadly-gold)" strokeWidth="1.5" />
        <path d="M15 22.5C23 18.5 41 18.5 49 22.5" stroke="url(#threadly-gold)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M32 20V42C32 48.5 37.5 51 43 47.5" stroke="url(#threadly-gold)" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="45.5" cy="45.5" r="3.6" fill="#9875DB" />
      </svg>
      {wordmark && <span className="font-display text-[1.45em] leading-none tracking-tight text-[#F5F0E8]">Threadly</span>}
    </span>
  );
}
