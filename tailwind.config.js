/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        'sans': ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
        card: "hsl(var(--color-card) / <alpha-value>)",
        border: "hsl(var(--color-border) / <alpha-value>)",
        accent: "hsl(var(--color-accent) / <alpha-value>)",
        accentForeground: "hsl(var(--color-accent-foreground) / <alpha-value>)",
        destructive: "hsl(var(--color-destructive) / <alpha-value>)",
        destructiveForeground: "hsl(var(--color-destructive-foreground) / <alpha-value>)",
        success: "hsl(var(--color-success) / <alpha-value>)",
        successForeground: "hsl(var(--color-success-foreground) / <alpha-value>)",
        warning: "hsl(var(--color-warning) / <alpha-value>)",
        warningForeground: "hsl(var(--color-warning-foreground) / <alpha-value>)"
      }
    }
  },
  plugins: []
};