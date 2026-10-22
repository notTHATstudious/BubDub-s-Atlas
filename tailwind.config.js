/** @type {import('tailwindcss').Config} */
// Tailwind v3 on purpose: its CSS works on older phone browsers, which
// v4 (cascade layers, color-mix) does not support.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Green and beige: #374F4F (pine) and #DACCC4 (sand).
      colors: {
        cream: '#f4eee9',
        sand: '#daccc4',
        pine: '#374f4f',
        ink: '#2a3433',
        muted: '#6c7472',
        line: '#e2d7cf',
        sage: '#6f8f86',
        sky: '#9fb6b4',
        sun: '#d9b26a',
        clay: '#c07c62',
        navy: '#1e2f5a',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        brand: ['Pacifico', '"Brush Script MT"', 'cursive'],
      },
    },
  },
  plugins: [],
}
