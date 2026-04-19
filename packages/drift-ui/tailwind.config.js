/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Pixelify Sans"', 'cursive'],
        arcade: ['"Press Start 2P"', 'cursive'],
        zhBody: ['"Microsoft YaHei"', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"', 'sans-serif'],
      },
      colors: {
        arc: {
          bg: '#FFFFFF',
          panel: '#F8F6FC',
          border: '#D4CCE6',
          primary: '#9B8EC4',
          accent: '#E8A0BF',
          btn: '#7C6FAF',
          'btn-hover': '#6A5D9E',
          text: '#4A4063',
          'text-muted': '#8B7FA8',
          bubble: '#D4E4FC',
          dot: '#B8AED8',
          success: '#A8D8B9',
          warn: '#F5D6A0',
          error: '#F0B4B4',
          'crt-dark': '#2A2438',
        },
      },
    },
  },
  plugins: [],
}
