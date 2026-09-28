/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        s: {
          // Brand Official
          primary:        '#2563EB', // Safety Blue (#2563EB)
          'primary-dim':  '#1D4ED8',
          'primary-glow': 'rgba(37, 99, 235, 0.25)',
          sky:            '#38BDF8', // Sky (#38BDF8)
          green:          '#22C55E', // Safety Green (#22C55E)

          // Alert scale Official
          amber:          '#F59E0B', // Safety Amber (#F59E0B)
          medium:         '#F59E0B',
          danger:         '#EF4444', // Safety Red (#EF4444)
          high:           '#EF4444',
          critical:       '#DC2626', // Critical Red (#DC2626)
          low:            '#22C55E', // Positive / Low

          // Surfaces
          base:           '#F8FAFC',
          surface:        '#FFFFFF',
          'surface-2':    '#F1F5F9',
          'surface-3':    '#E2E8F0',
          border:         '#E2E8F0',
          'border-2':     '#CBD5E1',

          // Dark mode alternatives
          'dark-base':    '#080D1A',
          'dark-surface': '#0F172A',
          'dark-surface2':'#1E293B',

          // Text
          text:           '#0F172A', // Deep Contrast Main Text
          'text-2':       '#64748B', // Secondary Text
          'text-3':       '#94A3B8', // Tertiary / Muted
          'text-light':   '#F8FAFC', // For dark backgrounds
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display',
          'Inter', 'Segoe UI', 'Roboto', 'sans-serif'
        ],
        mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.2', letterSpacing: '0.06em' }],
        xs:    ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        sm:    ['13px', { lineHeight: '1.55' }],
        base:  ['15px', { lineHeight: '1.55' }],
        lg:    ['18px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        xl:    ['22px', { lineHeight: '1.2',  letterSpacing: '-0.025em' }],
        '2xl': ['28px', { lineHeight: '1.15', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        pill: '9999px',
        '4xl': '28px',
        '3xl': '24px',
        '2xl': '20px',
        xl:    '16px',
        lg:    '12px',
        md:    '8px',
      },
      boxShadow: {
        'sheet':   '0 -8px 40px rgba(15,23,42,0.15), 0 0 0 1px rgba(226,232,240,0.8)',
        'card':    '0 4px 20px rgba(15,23,42,0.06), 0 0 0 1px rgba(226,232,240,0.8)',
        'marker':  '0 4px 16px rgba(15,23,42,0.35)',
        'fab':     '0 8px 28px rgba(37,99,235,0.35), 0 2px 8px rgba(37,99,235,0.2)',
        'glow-primary': '0 0 20px rgba(37,99,235,0.35), 0 4px 12px rgba(37,99,235,0.2)',
        'glow-danger':  '0 0 20px rgba(239,68,68,0.35), 0 4px 12px rgba(239,68,68,0.2)',
        'island':  '0 12px 32px rgba(15,23,42,0.12), 0 0 0 1px rgba(226,232,240,0.9)',
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      animation: {
        'pulse-slow':     'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-ring':     'pulse-ring 2s cubic-bezier(0.25,0.46,0.45,0.94) infinite',
        'slide-up':       'slide-up 0.3s cubic-bezier(0.22,1,0.36,1)',
        'fade-in':        'fade-in 0.2s ease-out',
        'scale-in':       'scale-in 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        'shimmer':        'shimmer 2s linear infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%':   { transform: 'scale(0.9)', opacity: '0.9' },
          '50%':  { transform: 'scale(1.6)', opacity: '0.3' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
