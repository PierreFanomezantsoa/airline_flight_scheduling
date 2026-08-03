/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs orientées "Aéronautique"
        airline: {
          navy: '#1a365d',
          blue: '#2b6cb0',
          sky: '#ebf8ff',
          alert: '#c53030'
        }
      }
    },
  },
  plugins: [],
}