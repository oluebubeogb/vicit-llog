import type { Config } from 'tailwindcss';

/**
 * Colour system — 5 families, each with full 50–950 shades:
 *   brand   primary   (Branding → Primary colour, CSS variables, live-updated)
 *   accent  secondary (Branding → Secondary colour, CSS variables, live-updated)
 *   emerald success · amber attention · violet highlight (Tailwind scales)
 * Red is reserved for errors / destructive actions only.
 */
const v = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [
      s,
      `rgb(var(--${name}-${s}) / <alpha-value>)`,
    ]),
  );

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: v('brand'),
        accent: v('accent'),
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.06)',
        lift: '0 2px 4px rgb(15 23 42 / 0.04), 0 14px 32px -10px rgb(var(--brand-700) / 0.22)',
        glow: '0 10px 30px -8px rgb(var(--brand-600) / 0.45)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.6)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-8px,0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--brand-500) / 0.45)' },
          '100%': { boxShadow: '0 0 0 10px rgb(var(--brand-500) / 0)' },
        },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade .4s ease both',
        shimmer: 'shimmer 1.6s infinite',
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(.2,.8,.2,1) infinite',
      },
    },
  },
  plugins: [],
};
export default config;
