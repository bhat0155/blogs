/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // This is CRITICAL - allows us to toggle dark mode via a CSS class
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'), // Adds beautiful 'prose' classes for markdown
  ],
}
