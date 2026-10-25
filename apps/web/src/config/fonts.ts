import localFont from 'next/font/local';

/**
 * Barlow, the interface font of the FireScape identity (assets/brand/fonts, OFL 1.1),
 * self-hosted: woff2 files converted from the masters, served from this origin
 * (CSP font-src 'self'). Exposed as --font-barlow, first in the --font-sans stack
 * of the UI package (packages/ui/src/styles/globals.css).
 */
export const barlow = localFont({
  src: [
    { path: '../assets/fonts/barlow-400.woff2', weight: '400', style: 'normal' },
    { path: '../assets/fonts/barlow-500.woff2', weight: '500', style: 'normal' },
    { path: '../assets/fonts/barlow-600.woff2', weight: '600', style: 'normal' },
    { path: '../assets/fonts/barlow-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});
