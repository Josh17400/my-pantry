/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ECEAE4',
        surface: {
          DEFAULT: '#F7F6F2',
          raised: '#FCFCFC',
        },
        primary: {
          DEFAULT: '#484C20',
          soft: '#585C2C',
        },
        ink: {
          DEFAULT: '#1F1D18',
          muted: '#6E6A5A',
        },
        fresh: '#3B602D',
        low: {
          DEFAULT: '#8F5410',
          fill: '#C0741F',
        },
        critical: '#9B4514',
        tint: {
          sage: '#CCD4BC',
          tan: '#E0D8C0',
          sky: '#CCD4D4',
          cream: '#E0D4C8',
        },
        'bar-track': '#EFECE4',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.125rem', // 18px — between 16–20
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(31, 29, 24, 0.06), 0 4px 16px rgba(31, 29, 24, 0.04)',
        fab: '0 4px 14px rgba(72, 76, 32, 0.35)',
        tab: '0 -1px 12px rgba(31, 29, 24, 0.06)',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'tab-bar': '4.5rem',
      },
      minHeight: {
        tap: '2.75rem', // 44px
      },
      minWidth: {
        tap: '2.75rem',
      },
      /**
       * Stacking layers — keep in sync with ui/layers.ts Z_INDEX.
       * chrome (40): tab bar + FAB. sheet (50): modals above chrome.
       * toast (60): undo / transient above sheets. Do not invent freehand z-*.
       */
      zIndex: {
        chrome: '40',
        sheet: '50',
        toast: '60',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};
