import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#eaf4f5',
        ink: '#171e55',
        night: '#171e55',
        brand: {
          DEFAULT: '#2f39a9',
          dark: '#252f86',
          light: '#49a4bb',
        },
        accent: '#15d8b3',
      },
      fontFamily: {
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        body: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        page: '0 4px 24px -6px rgba(0,0,0,0.25)',
        card: '0 8px 24px -12px rgba(5, 12, 46, 0.65)',
      },
    },
  },
  plugins: [],
};

export default config;
