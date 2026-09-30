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
      mapFeatures: unstubbed('sites.mapFeatures'),
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
    objects: {
      types: unstubbed('objects.types'),
      type: unstubbed('objects.type'),
      listBySite: unstubbed('objects.listBySite'),
      get: unstubbed('objects.get'),
      create: unstubbed('objects.create'),
      update: unstubbed('objects.update'),
      mapFeatures: unstubbed('objects.mapFeatures'),
      ...overrides.objects,
    },
    plans: {
      listBySite: unstubbed('plans.listBySite'),
      get: unstubbed('plans.get'),
      create: unstubbed('plans.create'),
      addRevision: unstubbed('plans.addRevision'),
      update: unstubbed('plans.update'),
      ...overrides.plans,
    },
    zones: {
      listBySite: unstubbed('zones.listBySite'),
      get: unstubbed('zones.get'),
      create: unstubbed('zones.create'),
      update: unstubbed('zones.update'),
      ...overrides.zones,
    },
    risks: {
      types: unstubbed('risks.types'),
      type: unstubbed('risks.type'),
      createType: unstubbed('risks.createType'),
      updateType: unstubbed('risks.updateType'),
      listBySite: unstubbed('risks.listBySite'),
      get: unstubbed('risks.get'),
      create: unstubbed('risks.create'),
      update: unstubbed('risks.update'),
      ...overrides.risks,
    },
    etare: {
      dossiers: unstubbed('etare.dossiers'),
      overview: unstubbed('etare.overview'),
      createRevision: unstubbed('etare.createRevision'),
      revision: unstubbed('etare.revision'),
      submit: unstubbed('etare.submit'),
      queue: unstubbed('etare.queue'),
      decide: unstubbed('etare.decide'),
      publication: unstubbed('etare.publication'),
      approvalOf: unstubbed('etare.approvalOf'),
      requestPublication: unstubbed('etare.requestPublication'),
      ...overrides.etare,
    },
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
