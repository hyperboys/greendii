import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-public-sans)", "var(--font-noto-thai)", "sans-serif"],
      },
      spacing: {
        "58.75": "235px",
        "63": "252px",
        "87.5": "350px",
      },
      maxWidth: {
        "4": "16px",
        "370": "1480px",
      },
      boxShadow: {
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
