import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          violet: "#361a62", // Violent Violet
          bush: "#6138a2", // Butterfly Bush
          white: "#ffffff", // Pure White
          pastel: "#9a75ce", // Dark Pastel Purple
          jaguar: "#02010a", // Jaguar
          electric: "#b129ff", // Electric Purple
          haiti: "#180632", // Haiti
          yellow: "#ffba00", // Selective Yellow
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
