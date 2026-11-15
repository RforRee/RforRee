/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b1220',
          900: '#111a2b',
          800: '#1a2740',
          700: '#243352',
          600: '#334667',
        },
        dock: {
          50: '#fff8eb',
          100: '#ffefc7',
          300: '#f5c451',
          400: '#e8a317',
          500: '#c9840a',
          600: '#a06608',
        },
        bay: {
          400: '#3db8a0',
          500: '#1f9a84',
          600: '#167a69',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        display: ['"Barlow Condensed"', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
