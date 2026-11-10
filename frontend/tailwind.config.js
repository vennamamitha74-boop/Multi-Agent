/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        deep: {
          bg: "#0F1515",
          sidebar: "#08282A",
          card: "#1C5052",
          cardHover: "#236365",
          primary: "#177D81",
          primaryHover: "#1B8E93",
          accent: "#BDDED6",
          accentMuted: "#9FB4B0",
          border: "rgba(189, 222, 214, 0.15)",
          borderStrong: "#1C5052",
        },
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          500: "#177D81",
          600: "#13696C",
          700: "#0F5558",
          900: "#08282A",
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
