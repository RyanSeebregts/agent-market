import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        flare: {
          coral: "#E62058",
          dark: "#0a0a0a",
          card: "#141414",
          border: "#2a2a2a",
        },
      },
      keyframes: {
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        slideIn: "slideIn 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
