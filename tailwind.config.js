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
          violet: "#361a62",
          bush: "#6138a2",
          white: "#ffffff",
          pastel: "#9a75ce",
          jaguar: "#02010a",
          electric: "#b129ff",
          haiti: "#180632",
          yellow: "#ffba00",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
