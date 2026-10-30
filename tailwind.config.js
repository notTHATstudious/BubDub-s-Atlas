/** @type {import('tailwindcss').Config} */
// Tailwind v3 on purpose: its CSS works on older phone browsers, which
// v4 (cascade layers, color-mix) does not support.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Green and beige: #374F4F (pine) and #DACCC4 (sand).
      // page, white, ink, muted, line and sand switch for dark mode (variables in src/index.css).
      // rgba(var(), alpha) rather than rgb(... / alpha) so older phone browsers still read it.
      colors: {
        page: 'rgba(var(--page), <alpha-value>)',
        white: 'rgba(var(--card), <alpha-value>)',
        cream: '#f4eee9',
        sand: 'rgba(var(--sand), <alpha-value>)',
        pine: '#374f4f',
        ink: 'rgba(var(--ink), <alpha-value>)',
        muted: 'rgba(var(--muted), <alpha-value>)',
        line: 'rgba(var(--line), <alpha-value>)',
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
