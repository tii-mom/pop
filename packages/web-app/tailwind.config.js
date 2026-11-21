/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pop: {
          bg: '#080A0F',
          card: '#11141E',
          elevated: '#171C29',
          border: '#1F2536',
          borderHover: '#2E364D',
          lime: '#B8FF2C',
          limeDeep: '#76AD10',
          mini: '#FFD43B',
          pro: '#FF6B00',
          whale: '#9D4EDD',
        },
      },
    },
  },
  plugins: [],
};
