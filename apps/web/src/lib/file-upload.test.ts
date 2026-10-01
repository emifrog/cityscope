// @vitest-environment node
import { createHash } from 'node:crypto';
import { API_BASE_PATH, type DocumentUploadResponse } from '@etare/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client';
import { describeFile, uploadFile, type UploadStep } from './file-upload';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n% consignes\n%%EOF\n');
const pdfFile = (name = 'consignes.pdf') => new File([PDF_BYTES], name, { type: 'application/pdf' });
const ASSET_ID = '06000005-0000-4000-8000-000000000001';

const created: DocumentUploadResponse = {
  document: {
    id: '06000006-0000-4000-8000-000000000001',
    site_id: '06000002-0000-4000-8000-000000000001',
    category: 'instruction',
    title: 'Consignes',
    offline_policy: 'never',
    portal_visible: false,
    status: 'active',
    row_version: 1,
    versions: [],
  },
  upload: {
    asset_id: ASSET_ID,
    method: 'PUT',
    url: 'https://storage.example.test/upload/sign/quarantine?token=t',
    headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
    expires_at: '2026-10-01T10:00:00.000Z',
  },
};

describe('describeFile', () => {
  it('declares the real type, size and SHA-256 of the content', async () => {
    const { declaration } = await describeFile(pdfFile());
    expect(declaration).toEqual({
      filename: 'consignes.pdf',
      mime_type: 'application/pdf',
      size_bytes: PDF_BYTES.byteLength,
      sha256: createHash('sha256').update(PDF_BYTES).digest('hex'),
    });
  });

  it('trusts the content, not the extension nor the browser type', async () => {
    const disguised = new File([new TextEncoder().encode('MZ executable')], 'plan.pdf', { type: 'application/pdf' });
    await expect(describeFile(disguised)).rejects.toThrow(/Type de fichier non autorisé/);
  });

  it('refuses empty files and unsafe names before any request', async () => {
    await expect(describeFile(new File([], 'vide.pdf'))).rejects.toThrow(/vide/);
    await expect(describeFile(pdfFile('a\u0000b.pdf'))).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('uploadFile', () => {
  it('declares, sends to quarantine with the signed headers, then asks for verification', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith(API_BASE_PATH)
        ? Response.json({ asset_id: ASSET_ID, scan_status: 'pending', job_id: null }, { status: 202 })
        : new Response('{}', { status: 200 }),
    );
    const declare = vi.fn(async () => created);
    const steps: UploadStep[] = [];

    await uploadFile({ token: 't', tenantId: 'tenant', fetchImpl }, pdfFile(), declare, (step) => steps.push(step));

    expect(steps).toEqual(['reading', 'declaring', 'sending', 'confirming']);
    expect(declare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mime_type: 'application/pdf', size_bytes: PDF_BYTES.byteLength }),
    );
    const [put, confirm] = fetchImpl.mock.calls;
    expect(put?.[0]).toBe(created.upload.url);
    expect(put?.[1]).toMatchObject({ method: 'PUT', headers: created.upload.headers });
    expect(confirm?.[0]).toBe(`${API_BASE_PATH}/assets/${ASSET_ID}/uploaded`);
    expect(confirm?.[1]).toMatchObject({ method: 'POST' });
  });

  it('does not ask for verification when the storage refuses the file', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('denied', { status: 403 }));
    await expect(
      uploadFile({ token: 't', tenantId: 'tenant', fetchImpl }, pdfFile(), async () => created),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
