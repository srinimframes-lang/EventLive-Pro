/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand — driven by CSS variables so white-label customers can
        // theme it at runtime. Defaults (in index.css) match the original
        // plum/rose palette exactly, so the default site is unchanged.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Gold accent for premium highlights.
        gold: {
          50: '#fbf7ef',
          100: '#f5ebd5',
          200: '#ecd6a6',
          300: '#e0bd72',
          400: '#d4a24a',
          500: '#c4882f',
          600: '#a86a25',
          700: '#864f20',
          800: '#6f4020',
          900: '#5e361e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'ui-serif', 'serif'],
      },
    },
  },
  plugins: [],
};
