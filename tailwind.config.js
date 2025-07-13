/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        gmarketsans: ['Gmarket Sans', 'sans-serif'], // Gmarket Sans 폰트 패밀리 정의
      },
    },
  },
  plugins: [],
};
