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
          navy: '#172554',
          blue: '#2563eb',
          sky: '#dbeafe',
          alert: '#dc2626'
        }
      }
    },
  },
  plugins: [],
}
