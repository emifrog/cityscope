import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#13233f',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
