import type { ExportRun } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportsAdmin } from './exports-admin';

const runs: ExportRun[] = [];
const mutate = vi.fn();

// No session nor tenant in a unit test: the hooks answer with the fixtures above.
vi.mock('@/lib/queries', () => ({
  queryKeys: { exports: (tenantId: string) => ['tenant', tenantId, 'exports'] },
  useExports: () => ({ data: runs, isPending: false, error: null }),
  useApiMutation: () => ({ mutate, isPending: false, error: null }),
}));

afterEach(cleanup);

const SHA = 'a'.repeat(64);

const ready: ExportRun = {
  id: '07000001-0000-4000-8000-000000000001',
  status: 'ready',
  requested_by_name: 'Cne Martin',
  requested_at: '2026-10-08T08:00:00.000Z',
  started_at: '2026-10-08T08:00:05.000Z',
  finished_at: '2026-10-08T08:03:00.000Z',
  expires_at: '2026-10-15T08:03:00.000Z',
  parts: [
    {
      index: 0,
      kind: 'data',
      filename: 'donnees.zip',
      media_type: 'application/zip',
      size_bytes: 2_097_152,
      sha256: SHA,
    },
    {
      index: 1,
      kind: 'files',
      filename: 'fichiers-1.zip',
      media_type: 'application/zip',
      size_bytes: 512_000,
      sha256: SHA,
    },
  ],
  total_bytes: 2_609_152,
  file_count: 12,
  row_count: 1_234,
  error_code: null,
  error_detail: null,
};

const failed: ExportRun = {
  id: '07000001-0000-4000-8000-000000000002',
  status: 'failed',
  requested_by_name: 'Cne Martin',
  requested_at: '2026-10-07T08:00:00.000Z',
  started_at: '2026-10-07T08:00:05.000Z',
  finished_at: '2026-10-07T08:01:00.000Z',
  expires_at: null,
  parts: [],
  total_bytes: null,
  file_count: null,
  row_count: null,
  error_code: 'STORAGE_UNAVAILABLE',
  error_detail: 'Le stockage des fichiers est injoignable.',
};

describe('ExportsAdmin (ADMIN-04)', () => {
  it('lists the runs with their parts, expiry and failure cause', () => {
    runs.splice(0, runs.length, ready, failed);
    render(<ExportsAdmin />);

    expect(screen.getByRole('button', { name: 'donnees.zip (2 Mo)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'fichiers-1.zip (500 Ko)' })).toBeDefined();
    expect(screen.getByText(/^Prêt jusqu’au /).textContent).toContain('15 oct. 2026');
    expect(screen.getByText('Le stockage des fichiers est injoignable.')).toBeDefined();
    expect(screen.getByText('Échec')).toBeDefined();
    expect(screen.getByText('1 234 lignes')).toBeDefined();

    const request = screen.getByRole('button', { name: 'Demander un export' });
    expect(request.hasAttribute('disabled')).toBe(false);
  });

  it('refuses a second request while one is being prepared', () => {
    runs.splice(0, runs.length, { ...failed, id: '07000001-0000-4000-8000-000000000003', status: 'building' });
    render(<ExportsAdmin />);
    expect(screen.getByText('En préparation')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Demander un export' }).hasAttribute('disabled')).toBe(true);
  });
});
