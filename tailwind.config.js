/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#dbeaff',
          200: '#bed9ff',
          300: '#90bdff',
          400: '#5a98ff',
          500: '#2f72ff',
          600: '#1e54f5',
          700: '#1a42d8',
          800: '#1b39ae',
          900: '#1c338a',
        },
      },
    },
  },
  plugins: [],
}
