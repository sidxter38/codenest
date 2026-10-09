/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,js,jsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#070B14',
          secondary: '#0A101C',
          surface: '#0D1320',
          elevated: '#111A2B',
        },
        border: {
          DEFAULT: '#1B2940',
        },
        brand: {
          ice: '#EAFBFF',
          cyan: '#7ADCF0',
          blue: '#4A6EA8',
          deep: '#1C2A52',
        },
        text: {
          primary: '#EAFBFF',
          secondary: '#8FA3BD',
        },
        success: '#4ADE80',
        warning: '#FBBF24',
        error: '#F87171',
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        code: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
    },
  },
  plugins: [],
}
