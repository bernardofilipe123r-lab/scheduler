/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f2f5',
          100: '#cce5eb',
          200: '#99cbd7',
          300: '#66b1c3',
          400: '#3397af',
          500: '#00435c',
          600: '#003a51',
          700: '#003146',
          800: '#00283b',
          900: '#001f30',
        },
        brand: {
          gym: '#00435c',
          healthy: '#2e7d32',
          vitality: '#c2185b',
          longevity: '#6a1b9a',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
