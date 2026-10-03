import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
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
  themeColor: '#012b5c',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request: its scripts carry the nonce of its Content Security Policy.
  await connection();
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
