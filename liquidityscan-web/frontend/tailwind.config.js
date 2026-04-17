/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./app.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": {
          DEFAULT: "#13ec37",
          hover: "#0fb82b",
          dim: "#0fbd2c"
        },
        "danger": "#ef4444",
        "background-dark": "#0b140d",
        "surface-dark": "#112214",
        "surface-border": "#234829",
        "glass-border": "#234829",
        "glass-bg": "rgba(17, 34, 20, 0.7)",
        "background-light": "#f6f8f6",
        "surface-light": "#ffffff",
        "surface-light-secondary": "#f0f4f0",
        "border-light": "#86efac",
        "text-dark": "#1a1a1a",
        "text-light-secondary": "#2d3748",
      },
      fontFamily: {
        "display": ["Inter", "sans-serif"],
        "sans": ["Inter", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "lg": "1rem",
        "xl": "1.5rem",
        "2xl": "2rem",
        "3xl": "2.5rem",
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(19, 236, 55, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(19, 236, 55, 0.03) 1px, transparent 1px)',
        'grid-pattern-light': 'linear-gradient(rgba(19, 236, 55, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(19, 236, 55, 0.05) 1px, transparent 1px)',
        'cinematic-gradient': 'radial-gradient(circle at 50% 0%, rgba(19, 236, 55, 0.15) 0%, rgba(5, 11, 7, 0) 70%)',
        'cinematic-gradient-light': 'radial-gradient(circle at 50% 0%, rgba(19, 236, 55, 0.1) 0%, rgba(246, 248, 246, 0) 70%)',
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(19, 236, 55, 0.2)',
        'glow-md': '0 0 20px rgba(19, 236, 55, 0.3)',
        'glow-lg': '0 0 30px rgba(19, 236, 55, 0.4)',
        'glow-xl': '0 0 40px rgba(19, 236, 55, 0.5)',
        'glow': '0 0 15px rgba(19, 236, 55, 0.15)',
        'glow-intense': '0 0 25px rgba(19, 236, 55, 0.25)',
        'glow-light-sm': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'glow-light-md': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'glow-light-lg': '0 8px 24px rgba(0, 0, 0, 0.16)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(19, 236, 55, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(19, 236, 55, 0.4)' },
        },
      },
    },
  },
  plugins: [
    function({ addVariant }) {
      addVariant('light', '.light &');
    },
  ],
}
