/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Threadly palette -------------------------------------------------
          // Reddit Orange — the action color.
          orange: "#ff4500",
          orangeHover: "#ff5722",
          orangeLight: "#fff1eb",
          orangeDark: "#cc3700",
          flame: "#ff3d00",

          // Violent Violet — the intelligence color.
          violet: "#7c3aed",
          violetDark: "#4c1d95",
          violetDeep: "#2e1065",
          violetLight: "#f5f3ff",
          violetPastel: "#c4b5fd",
          electric: "#8b5cf6",

          // Black & White — the canvas.
          black: "#0a0a0a",
          blackRich: "#141414",
          blackDeep: "#030303",
          white: "#ffffff",
          paper: "#faf9f7",
          offWhite: "#f5f4f1",
          cardWhite: "#ffffff",

          // Neutral accents
          muted: "#6f6a72",
          quiet: "#8d878f",
          border: "#e6e3de",
          line: "#efedea",
          darkBorder: "#26222a",

          // Legacy aliases referenced by the secondary marketing pages.
          pastel: "#c4b5fd",
          bush: "#7c3aed",
          jaguar: "#0a0a0a",
          haiti: "#141414",
        },
        ink: "#0a0a0a",
        paper: "#faf9f7",
        signal: "#ff4500",
        intellect: "#7c3aed",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.06em",
      },
      backgroundImage: {
        "gradient-thread": "linear-gradient(115deg, #ff4500 0%, #7c3aed 100%)",
        "gradient-thread-soft": "linear-gradient(115deg, #fff1eb 0%, #f5f3ff 100%)",
        "gradient-ink": "linear-gradient(160deg, #0a0a0a 0%, #16101f 55%, #1d0b05 100%)",
        "gradient-orange": "linear-gradient(135deg, #ff4500 0%, #ff8c00 100%)",
        "gradient-violet": "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
        "grid-ink":
          "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
        "grid-paper":
          "linear-gradient(rgba(10,10,10,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,10,.045) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "44px 44px",
      },
      boxShadow: {
        "tactile-orange": "-3px 3px 0 0 #cc3700",
        "tactile-violet": "-3px 3px 0 0 #4c1d95",
        "tactile-black": "-3px 3px 0 0 #0a0a0a",
        "tactile-white": "-3px 3px 0 0 #ffffff",
        "lift-orange": "-5px 5px 0 0 #cc3700",
        "lift-violet": "-5px 5px 0 0 #4c1d95",
        "lift-black": "-5px 5px 0 0 #0a0a0a",
        card: "0 1px 2px rgba(10,10,10,.04), 0 18px 40px -24px rgba(10,10,10,.28)",
        float: "0 30px 70px -32px rgba(10,10,10,.4)",
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        "pulse-ring": "pulseRing 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulseRing: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".35", transform: "scale(1.6)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
