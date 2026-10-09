import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteQrCode } from './site-qr-code';

const SITE = '06000002-0000-4000-8000-000000000001';

describe('QR code of a site', () => {
  it('encodes the link of the site under the address of the back-office', async () => {
    render(<SiteQrCode siteId={SITE} />);
    const link = `${window.location.origin}/sites/${SITE}`;
    await waitFor(() => expect(screen.getByRole('img', { name: `Code QR du site : ${link}` })).toBeTruthy());
    expect(screen.getByText(link)).toBeTruthy();
    // Modules drawn as one path of unit squares, inside a quiet zone of four modules.
    const path = document.querySelector('svg path')?.getAttribute('d') ?? '';
    expect(path.split('h1v1h-1z').length).toBeGreaterThan(150);
    expect(path.startsWith('M4 4')).toBe(true);
  });
});
