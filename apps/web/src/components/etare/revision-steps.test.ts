import type { EtareRevision, PublicationSummary } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { revisionSteps, summarizeChecks } from './revision-steps';

const person = { id: '02000001-0000-4000-8000-000000000001', name: 'Lt Dupont' };

function revision(partial: Partial<EtareRevision>): EtareRevision {
  return {
    id: '05000001-0000-4000-8000-000000000001',
    site_id: '06000002-0000-4000-8000-000000000001',
    revision_no: 2,
    status: 'draft',
    change_summary: null,
    content_hash: null,
    created_by: person,
    created_at: '2026-10-09T08:00:00.000Z',
    submitted_by: null,
    submitted_at: null,
    decided_at: null,
    base_publication_number: 1,
    decision: null,
    publication: null,
    row_version: 1,
    ...partial,
  };
}

const publication = (status: PublicationSummary['status']): PublicationSummary => ({
  id: '04000001-0000-4000-8000-000000000002',
  publication_number: 2,
  requested_at: '2026-10-09T09:00:00.000Z',
  status,
  published_at: null,
  manifest_hash: null,
  has_pdf: false,
  failure_code: status === 'failed' ? 'PDF' : null,
  withdrawal: null,
  row_version: 1,
});

const states = (steps: ReturnType<typeof revisionSteps>) => steps.map((step) => step.state);

describe('revisionSteps', () => {
  it('follows the cycle: writing, waiting for a validator, building, published', () => {
    const draft = revision({});
    expect(states(revisionSteps(draft, draft, true))).toEqual(['current', 'todo', 'todo']);
    expect(revisionSteps(draft, draft, true)[0]?.note).toBe('Révision n° 2 en cours');

    const submitted = revision({ status: 'submitted' });
    expect(states(revisionSteps(submitted, submitted, true))).toEqual(['done', 'current', 'todo']);

    const building = revision({ status: 'approved', publication: publication('building') });
    expect(states(revisionSteps(undefined, building, true))).toEqual(['done', 'done', 'current']);

    const published = revision({ status: 'approved', publication: publication('published') });
    expect(states(revisionSteps(undefined, published, true))).toEqual(['done', 'done', 'done']);
  });

  it('shows what blocks: a failed build, corrections requested', () => {
    const failed = revision({ status: 'approved', publication: publication('failed') });
    expect(revisionSteps(undefined, failed, true)[2]).toMatchObject({ state: 'blocked', note: 'Fabrication en échec' });

    const refused = revision({ status: 'changes_requested' });
    expect(revisionSteps(undefined, refused, false)[0]).toMatchObject({
      state: 'blocked',
      note: 'Corrections demandées',
    });
  });

  it('starts empty for a site without any revision', () => {
    expect(states(revisionSteps(undefined, undefined, false))).toEqual(['todo', 'todo', 'todo']);
    expect(revisionSteps(undefined, undefined, false)[0]?.note).toBe('Aucune révision');
  });
});

describe('summarizeChecks', () => {
  it('counts each level', () => {
    expect(
      summarizeChecks([
        { code: 'a', level: 'ok', label: '', detail: '' },
        { code: 'b', level: 'ok', label: '', detail: '' },
        { code: 'c', level: 'warning', label: '', detail: '' },
        { code: 'd', level: 'error', label: '', detail: '' },
      ]),
    ).toEqual({ ok: 2, warning: 1, error: 1 });
    expect(summarizeChecks([])).toEqual({ ok: 0, warning: 0, error: 0 });
  });
});
