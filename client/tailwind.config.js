/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand — deep romantic plum/rose for a premium wedding feel.
        brand: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#be185d',
          700: '#9d174d',
          800: '#831843',
          900: '#500724',
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
