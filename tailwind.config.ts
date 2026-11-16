import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f6f3eb',
        ink: '#20372e',
        night: '#10251e',
        brand: {
          DEFAULT: '#166344',
          dark: '#104b34',
          light: '#84bea0',
        },
        accent: '#9c4937',
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
