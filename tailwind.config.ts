import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        char: { DEFAULT: "#1A1A1A", 2: "#262626", 3: "#333333" },
        smoke: "#6B6B6B",
        mist: "#F3F3F2",
        ivory: "#F6F5F2",
        line: "#E3E3E1",
        brass: { DEFAULT: "#B08D57", light: "#D2B583", dark: "#7E6237" },
      },
      fontFamily: {
        display: ['"Bodoni Moda"', "Didot", "Georgia", "serif"],
        sans: ['Jost', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
} satisfies Config;
