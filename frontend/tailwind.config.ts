import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark navy fintech palette
        navy: {
          950: "#050d1a",
          900: "#0a1628",
          800: "#0f2040",
          700: "#162b56",
          600: "#1e3a6e",
        },
        slate: {
          // Extending default slate
          850: "#172033",
        },
        // Accent: electric blue
        accent: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#1d4ed8",
        },
        // Financial colours
        positive: "#22c55e",
        negative: "#ef4444",
        warning: "#f59e0b",
        neutral: "#94a3b8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.3)",
        glow: "0 0 20px rgba(59,130,246,0.3)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
