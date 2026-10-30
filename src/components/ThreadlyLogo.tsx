// The Threadly mark: a folded ribbon in flat violet. Keep in step with
// public/threadly-mark.svg.
const TOP = "M1125 218L885 62Q810 20 745 60L310 300Q220 355 220 435V570Q220 640 297 684Q280 650 335 622L1122 234Q1132 226 1125 218Z";
const FOLD = "M485 552L740 702L515 815L300 684Q280 650 335 622Z";

export default function ThreadlyLogo({ size = 28, wordmark = false, className = "" }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="190 20 1080 1090" role="img" aria-label="Threadly">
        <path d={FOLD} fill="#2F1FA8" />
        <path d={FOLD} fill="#2F1FA8" transform="rotate(180 730 563)" />
        <path d={TOP} fill="#8E7BFF" />
        <path d={TOP} fill="#5B3DF5" transform="rotate(180 730 563)" />
      </svg>
      {wordmark && <span className="text-[1.15em] font-semibold leading-none tracking-tight text-[#111114]">Threadly</span>}
    </span>
  );
}
