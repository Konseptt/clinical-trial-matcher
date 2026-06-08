import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "on-primary": "var(--color-on-primary)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        "accent-dark": "var(--color-accent-dark)",
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        muted: "var(--color-muted)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        destructive: "var(--color-destructive)",
        ring: "var(--color-ring)",
        faint: "var(--color-faint)",
        "faint-muted": "var(--color-faint-muted)",
        "body-muted": "var(--color-body-muted)",
        "border-subtle": "var(--color-border-subtle)",
        "muted-panel": "var(--color-muted-panel)",
        match: {
          high: "var(--color-match-high)",
          mid: "var(--color-match-mid)",
          low: "var(--color-match-low)",
        },
      },
      fontFamily: {
        display: ["var(--font-instrument)", "Georgia", "serif"],
        body: ["var(--font-figtree)", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "Courier New", "monospace"],
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
    },
  },
  plugins: [],
};

export default config;
