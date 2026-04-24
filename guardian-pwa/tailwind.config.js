/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kvh-bg': '#02080f',
        'kvh-card': '#0a1628',
        'kvh-crimson': '#e11d48',
        'kvh-green': '#22c55e',
        'kvh-amber': '#f59e0b',
        'kvh-blue': '#3b82f6',
        'kvh-purple': '#a855f7',
        'kvh-border': 'rgba(255, 255, 255, 0.08)',
        'kvh-text': '#e2e8f0',
        'kvh-text-muted': '#64748b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
