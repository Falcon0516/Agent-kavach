/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kvh: {
          bg: '#0d1117',
          card: '#161b22',
          border: '#30363d',
          green: '#3fb950',
          amber: '#d29922',
          red: '#da3633',
          blue: '#58a6ff',
          purple: '#cc5de8',
          'purple-bright': '#da77f2',
          text: '#c9d1d9',
          'text-muted': '#8b949e',
          'text-bright': '#f0f6fc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'glow-red': 'glowRed 1.5s ease-in-out infinite',
        'glow-green': 'glowGreen 2s ease-in-out infinite',
        'typewriter': 'typewriter 0.05s steps(1) forwards',
        'threat-pulse': 'threatPulse 1.5s ease-in-out infinite',
        'draw-route': 'drawRoute 1s ease-out forwards',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowRed: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(218, 54, 51, 0.4)' },
          '50%': { boxShadow: '0 0 24px rgba(218, 54, 51, 0.8)' },
        },
        glowGreen: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(63, 185, 80, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(63, 185, 80, 0.6)' },
        },
        threatPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
          '50%': { transform: 'scale(1.3)', opacity: '0.3' },
        },
        drawRoute: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
}
