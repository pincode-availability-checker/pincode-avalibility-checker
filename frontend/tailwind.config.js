/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif", "-apple-system", "BlinkMacSystemFont", "Segoe UI",
          "Roboto", "Helvetica Neue", "Arial", "sans-serif",
        ],
        mono: [
          "ui-monospace", "SFMono-Regular", "JetBrains Mono", "Menlo",
          "Consolas", "Liberation Mono", "monospace",
        ],
      },
      colors: {
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          raised: "rgb(var(--paper-raised) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        stamp: {
          DEFAULT: "rgb(var(--stamp) / <alpha-value>)",
          soft: "rgb(var(--stamp-soft) / <alpha-value>)",
        },
        available: {
          DEFAULT: "rgb(var(--available) / <alpha-value>)",
          bg: "rgb(var(--available-bg) / <alpha-value>)",
          line: "rgb(var(--available-line) / <alpha-value>)",
        },
        unavailable: {
          DEFAULT: "rgb(var(--unavailable) / <alpha-value>)",
          bg: "rgb(var(--unavailable-bg) / <alpha-value>)",
          line: "rgb(var(--unavailable-line) / <alpha-value>)",
        },
        pending: {
          DEFAULT: "rgb(var(--pending) / <alpha-value>)",
          bg: "rgb(var(--pending-bg) / <alpha-value>)",
          line: "rgb(var(--pending-line) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
