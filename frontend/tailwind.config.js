/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF7EF",
        "paper-line": "#E7E0D0",
        ink: "#1C2430",
        "ink-soft": "#565F6E",
        ledger: {
          green: "#2F6F4E",
          amber: "#B4791F",
          red: "#B8433B",
          navy: "#233A5E",
        },
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      backgroundImage: {
        ledger: "repeating-linear-gradient(to bottom, transparent, transparent 35px, #E7E0D0 36px)",
      },
    },
  },
  plugins: [],
};
