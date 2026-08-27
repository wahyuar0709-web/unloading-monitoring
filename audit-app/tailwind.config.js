/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./design-system/**/*.md",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Outfit", "Work Sans", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif'],
        heading: ["Poppins", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // RDI Design System Colors
        rdi: {
          navy: "#1E3A5F",
          "navy-light": "#2E426E",
          "navy-hover": "#3E5281",
          green: "#059669",
          "green-dark": "#047857",
          "green-light": "#CCFBCB",
          "green-soft": "#D1F9C2",
          slate: "#F8FAFC",
          "slate-dark": "#0F172A",
          "slate-light": "#F1F3F5",
          "slate-mute": "#475569",
          "slate-border": "#E4E7EB",
          "slate-muted": "#F2F3F4",
          red: "#DC2626",
          "red-light": "#F87171",
          "orange": "#F59E0B",
          "orange-light": "#FBBF24",
        },
      },
    },
    plugins: [require("tailwindcss-animate")],
  };
};
