/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/pixel-kit/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f4ead5',
        surface: {
          DEFAULT: '#fbf3df',
          raised: '#ffffff',
        },
        ink: {
          DEFAULT: '#2a2535',
          soft: '#5b536a',
          mute: '#9a93a8',
        },
        outline: {
          DEFAULT: '#2a2535',
          soft: '#cfc3a7',
        },
        primary: {
          DEFAULT: '#5468ff',
          hover: '#3d4ddb',
          soft: '#dee2ff',
        },
        'on-primary': '#ffffff',
        secondary: {
          DEFAULT: '#e85a8e',
          soft: '#ffd6e4',
        },
        success: '#2fa66a',
        warning: '#f0a93b',
        danger: '#d0413a',
      },
      fontFamily: {
        pixel: ['"Fusion Pixel"', '"Fusion-Pixel-12px-Monospaced"', 'monospace'],
        prose: ['"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'pixel-sm': ['10px', { lineHeight: '12px' }],
        'pixel-md': ['12px', { lineHeight: '16px' }],
        'pixel-lg': ['16px', { lineHeight: '24px' }],
        prose: ['17px', { lineHeight: '1.85' }],
        'prose-h': ['22px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        full: '9999px',
      },
      boxShadow: {
        'pixel-1': '2px 2px 0 #2a2535',
        'pixel-2': '3px 3px 0 #2a2535',
        'pixel-3': '4px 4px 0 #2a2535',
        'pixel-1-primary': '2px 2px 0 #5468ff',
      },
      maxWidth: {
        prose: '64ch',
      },
    },
  },
  plugins: [],
};
