import type { ResolvedAccess } from '@etare/domain';
import type { RequestSession } from './ports';

type Repositories = Omit<RequestSession, 'access'>;
export type SessionOverrides = { [K in keyof Repositories]?: Partial<Repositories[K]> };

function unstubbed(name: string) {
  return async (): Promise<never> => {
    throw new Error(`${name} is not stubbed in this test`);
  };
}

/**
 * Test helper: a request session whose repositories fail loudly unless the
 * test provides them, so a use case can never touch an unexpected repository.
 */
export function stubSession(access: ResolvedAccess, overrides: SessionOverrides = {}): RequestSession {
  return {
    access,
    identity: {
      me: unstubbed('identity.me'),
      holdsWithSecondFactor: unstubbed('identity.holdsWithSecondFactor'),
      ...overrides.identity,
    },
    sites: {
      list: unstubbed('sites.list'),
      get: unstubbed('sites.get'),
      create: unstubbed('sites.create'),
      update: unstubbed('sites.update'),
      ...overrides.sites,
    },
    buildings: {
      listBySite: unstubbed('buildings.listBySite'),
      create: unstubbed('buildings.create'),
      update: unstubbed('buildings.update'),
      createLevel: unstubbed('buildings.createLevel'),
      updateLevel: unstubbed('buildings.updateLevel'),
      ...overrides.buildings,
    },
    classifications: {
      listBySite: unstubbed('classifications.listBySite'),
      create: unstubbed('classifications.create'),
      update: unstubbed('classifications.update'),
      ...overrides.classifications,
    },
    contacts: {
      listBySite: unstubbed('contacts.listBySite'),
      create: unstubbed('contacts.create'),
      update: unstubbed('contacts.update'),
      ...overrides.contacts,
    },
    externalIds: {
      listBySite: unstubbed('externalIds.listBySite'),
      create: unstubbed('externalIds.create'),
      ...overrides.externalIds,
    },
    documents: {
      listBySite: unstubbed('documents.listBySite'),
      create: unstubbed('documents.create'),
      addVersion: unstubbed('documents.addVersion'),
      update: unstubbed('documents.update'),
      ...overrides.documents,
    },
    assets: { get: unstubbed('assets.get'), ...overrides.assets },
    members: {
      list: unstubbed('members.list'),
      add: unstubbed('members.add'),
      update: unstubbed('members.update'),
      ...overrides.members,
    },
    jobs: { enqueue: unstubbed('jobs.enqueue'), ...overrides.jobs },
    audit: { record: unstubbed('audit.record'), ...overrides.audit },
  };
}
