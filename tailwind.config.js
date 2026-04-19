/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#f97316', // orange-500 — same as PWA
        'background-dark': '#111418',
        'background-light': '#f8fafc',
        'surface-dark': '#1a1d23',
        'border-dark': '#2a2d35',
        'text-secondary': '#94a3b8',
        'text-muted': '#64748b',
      },
      fontFamily: {
        display: ['System'], // Uses system font; can swap to custom later
      },
    },
  },
  plugins: [],
};
