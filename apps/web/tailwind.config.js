/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['Fusion Pixel', 'Fusion-Pixel', 'monospace'],
      },
    },
  },
  plugins: [],
};
