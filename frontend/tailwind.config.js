export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 20px 55px rgba(17, 24, 39, 0.08)',
      },
      colors: {
        surface: {
          DEFAULT: '#F7F8FC',
          dark: '#0F172A',
        },
        brand: {
          50: '#F4F4FF',
          100: '#E8E9FF',
          200: '#C9CCFF',
          400: '#7D82FF',
          500: '#5D63F6',
          600: '#4B52D9',
          700: '#3E44BC',
        },
        border: '#E5E7EB',
      },
      backgroundImage: {
        'soft-gradient': 'linear-gradient(135deg, rgba(93,99,246,0.16), rgba(14,165,233,0.08))',
      },
    },
  },
  plugins: [],
};
