import type {
  Building,
  Classification,
  Contact,
  Document,
  ObjectType,
  RiskType,
  EtareChange,
  EtareCheck,
  EtareSection,
  EtareSnapshot,
  OperationalObject,
  Plan,
  PlanPosition,
  Risk,
  SiteDetail,
  Zone,
} from '@etare/contracts';
import { canonicalJson } from '@etare/domain';

/** Working data of a site, as the API reads it (RLS applied). */
export interface WorkingData {
  readonly site: SiteDetail;
  readonly classifications: readonly Classification[];
  readonly buildings: readonly Building[];
  readonly contacts: readonly Contact[];
  readonly plans: readonly Plan[];
  readonly zones: readonly Zone[];
  readonly objects: readonly OperationalObject[];
  readonly risks: readonly Risk[];
  readonly documents: readonly Document[];
  /** Catalogue of the SIS (national and own entries). */
  readonly objectTypes: readonly ObjectType[];
  readonly riskTypes: readonly RiskType[];
}

/** Deterministic order: display order first when there is one, then the stable identifier. */
const byOrder = <T extends { id: string; sort_order?: number }>(left: T, right: T) =>
  (left.sort_order ?? 0) - (right.sort_order ?? 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

const placement = (position: PlanPosition | null) =>
  position ? { plan_revision_id: position.plan_revision_id, geometry: position.geometry } : null;

const currentBackground = (plan: Plan) => plan.revisions.find((revision) => revision.is_current) ?? null;

/**
 * Builds the canonical snapshot of a site: only what the terrain may use
 * (active records, OPS contacts, checked files, current backgrounds).
 */
/** Checked photos of an object, in their order; the key is omitted when there are none. */
function snapshotPhotos(object: OperationalObject) {
  const photos = object.photos
    .filter((photo) => photo.status === 'active' && photo.asset.scan_status === 'clean')
    .map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      asset: {
        id: photo.asset.id,
        filename: photo.asset.filename,
        mime_type: photo.asset.mime_type,
        size_bytes: photo.asset.size_bytes,
        sha256: photo.asset.sha256,
      },
    }));
  return photos.length > 0 ? { photos } : {};
}

export function buildSnapshot(data: WorkingData): EtareSnapshot {
  const { site } = data;
  const snapshot: Omit<EtareSnapshot, 'catalog'> = {
    schema_version: 1,
    site: {
      id: site.id,
      etare_number: site.etare_number,
      name: site.name,
      short_name: site.short_name,
      site_type: site.site_type,
      status: site.status,
      sensitivity: site.sensitivity,
      address: site.address,
      location: site.location,
      footprint: site.footprint,
    },
    classifications: [...data.classifications]
      .sort(byOrder)
      .map(({ site_id: _site, row_version: _version, ...classification }) => classification),
    buildings: data.buildings
      .filter((building) => building.status === 'active')
      .sort(byOrder)
      .map(({ site_id: _site, status: _status, row_version: _version, levels, ...building }) => ({
        ...building,
        levels: levels
          .filter((level) => level.status === 'active')
          .sort(byOrder)
          .map(({ building_id: _building, status: _levelStatus, row_version: _levelVersion, ...level }) => level),
      })),
    contacts: data.contacts
      .filter((contact) => contact.status === 'active' && contact.visibility === 'ops')
      .sort(byOrder)
      .map(
        ({ site_id: _site, visibility: _visibility, status: _status, row_version: _version, ...contact }) => contact,
      ),
    plans: data.plans
      .filter((plan) => plan.status === 'active' && currentBackground(plan)?.asset.scan_status === 'clean')
      .sort(byOrder)
      .map((plan) => {
        const background = currentBackground(plan);
        if (!background) throw new Error('A published plan has a current background.');
        const { asset } = background;
        return {
          id: plan.id,
          title: plan.title,
          plan_type: plan.plan_type,
          building_id: plan.building_id,
          level_id: plan.level_id,
          background: {
            revision_id: background.id,
            revision_no: background.revision_no,
            page_number: background.page_number,
            width: background.width,
            height: background.height,
            asset: {
              id: asset.id,
              filename: asset.filename,
              mime_type: asset.mime_type,
              size_bytes: asset.size_bytes,
              sha256: asset.sha256,
            },
          },
        };
      }),
    zones: data.zones
      .filter((zone) => zone.status === 'active')
      .sort(byOrder)
      .map((zone) => ({
        id: zone.id,
        level_id: zone.level_id,
        name: zone.name,
        zone_type: zone.zone_type,
        plan_position: placement(zone.plan_position),
      })),
    objects: data.objects
      .flatMap((object) => (object.status === 'archived' ? [] : [{ ...object, status: object.status }]))
      .sort(byOrder)
      .map((object) => ({
        id: object.id,
        type_code: object.type_code,
        type_name: object.type_name,
        category: object.category,
        name: object.name,
        label: object.label,
        building_id: object.building_id,
        level_id: object.level_id,
        zone_id: object.zone_id,
        geometry: object.geometry,
        plan_position: placement(object.plan_position),
        properties: object.properties,
        instructions: object.instructions,
        criticality: object.criticality,
        status: object.status,
        verified_at: object.verified_at,
        ...snapshotPhotos(object),
      })),
    risks: data.risks
      .filter((risk) => risk.status === 'active')
      .sort(byOrder)
      .map((risk) => ({
        id: risk.id,
        type_code: risk.type_code,
        type_name: risk.type_name,
        icon_key: risk.icon_key,
        severity: risk.severity,
        label: risk.label,
        description: risk.description,
        quantity: risk.quantity,
        unit: risk.unit,
        properties: risk.properties,
        building_id: risk.building_id,
        level_id: risk.level_id,
        zone_id: risk.zone_id,
        plan_position: placement(risk.plan_position),
        ...(risk.geometry ? { geometry: risk.geometry } : {}),
      })),
    documents: data.documents
      .filter((document) => document.status === 'active' && document.versions[0]?.asset.scan_status === 'clean')
      .sort(byOrder)
      .map((document) => {
        const version = document.versions[0];
        if (!version) throw new Error('A published document has a version.');
        const { asset } = version;
        return {
          id: document.id,
          title: document.title,
          category: document.category,
          offline_policy: document.offline_policy,
          ...(document.portal_visible ? { portal_visible: true as const } : {}),
          version: {
            id: version.id,
            version_no: version.version_no,
            valid_from: version.valid_from,
            expires_at: version.expires_at,
            asset: {
              id: asset.id,
              filename: asset.filename,
              mime_type: asset.mime_type,
              size_bytes: asset.size_bytes,
              sha256: asset.sha256,
            },
          },
        };
      }),
  };
  const byCode = <T extends { code: string }>(left: T, right: T) => (left.code < right.code ? -1 : 1);
  const objectCodes = new Set(snapshot.objects.map((object) => object.type_code));
  const riskCodes = new Set(snapshot.risks.map((risk) => risk.type_code));
  return {
    ...snapshot,
    catalog: {
      object_types: data.objectTypes
        .filter((type) => objectCodes.has(type.code))
        .sort(byCode)
        .map(({ code, name, category, icon_key, properties_schema }) => ({
          code,
          name,
          category,
          icon_key,
          properties_schema,
        })),
      risk_types: data.riskTypes
        .filter((type) => riskCodes.has(type.code))
        .sort(byCode)
        .map(({ code, name, icon_key, properties_schema }) => ({ code, name, icon_key, properties_schema })),
    },
  };
}

/** SHA-256 (hex) of the canonical text of a snapshot or a manifest. */
export async function contentHash(value: unknown, sha256: (text: string) => Promise<string>): Promise<string> {
  return sha256(canonicalJson(value));
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Beyond this distance from the reference point, a risk drawn on the map is flagged. */
const FAR_RISK_METERS = 2000;

const firstPosition = (geometry: NonNullable<Risk['geometry']>): readonly number[] =>
  geometry.type === 'Point' ? geometry.coordinates : (geometry.coordinates[0]?.[0] ?? []);

/** Great-circle distance between two WGS 84 positions (longitude, latitude), in metres. */
export function distanceMeters(from: readonly number[], to: readonly number[]): number {
  const [lon1 = 0, lat1 = 0] = from;
  const [lon2 = 0, lat2 = 0] = to;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}
const CONTACT_CHECK_DAYS = 365;

/**
 * Checks before submission (ETARE-01, "contrôle avant validation"). An error
 * blocks the submission: the frozen content must be complete and exact.
 */
export function preSubmissionChecks(data: WorkingData, now: Date): EtareCheck[] {
  const checks: EtareCheck[] = [];
  const add = (code: string, level: EtareCheck['level'], label: string, detail: string) =>
    checks.push({ code, level, label, detail });

  add(
    'site_location',
    data.site.location ? 'ok' : 'error',
    'Point de référence du site',
    data.site.location ? 'Le site est placé sur la carte.' : 'Placez le site sur la carte (onglet Localisation).',
  );
  add(
    'etare_number',
    data.site.etare_number ? 'ok' : 'warning',
    'Numéro ETARE',
    data.site.etare_number ?? 'Aucun numéro ETARE : il identifie le dossier sur le terrain.',
  );

  const activePlans = data.plans.filter((plan) => plan.status === 'active');
  const unchecked = activePlans.filter((plan) => currentBackground(plan)?.asset.scan_status !== 'clean');
  add(
    'plan_backgrounds',
    unchecked.length > 0 ? 'error' : 'ok',
    'Fonds de plans contrôlés',
    unchecked.length > 0
      ? `${unchecked.map((plan) => plan.title).join(', ')} : fond en cours de contrôle ou refusé.`
      : plural(activePlans.length, 'plan prêt', 'plans prêts') + '.',
  );

  const levels = data.buildings
    .filter((building) => building.status === 'active')
    .flatMap((building) => building.levels.filter((level) => level.status === 'active'));
  const planned = new Set(activePlans.filter((plan) => plan.plan_type === 'level').map((plan) => plan.level_id));
  const covered = levels.filter((level) => planned.has(level.id)).length;
  add(
    'level_plans',
    levels.length === 0 || covered === levels.length ? 'ok' : 'warning',
    `Plans de niveaux ${covered}/${levels.length}`,
    levels.length === covered
      ? 'Chaque niveau a son plan.'
      : `${plural(levels.length - covered, 'niveau n’a', 'niveaux n’ont')} pas encore de plan.`,
  );

  const activePlanIds = new Set(activePlans.map((plan) => plan.id));
  const stale = [
    ...data.zones.filter((zone) => zone.status === 'active').map((zone) => zone.plan_position),
    ...data.objects.filter((object) => object.status !== 'archived').map((object) => object.plan_position),
    ...data.risks.filter((risk) => risk.status === 'active').map((risk) => risk.plan_position),
  ].filter((position) => position && !position.is_current && activePlanIds.has(position.plan_id)).length;
  add(
    'positions_to_replace',
    stale > 0 ? 'error' : 'ok',
    'Éléments placés sur le fond actuel',
    stale > 0
      ? `${plural(stale, 'élément reste', 'éléments restent')} sur un fond remplacé : replacez-les (onglet Plans).`
      : 'Aucun élément à replacer.',
  );

  // Zones moved or archived re-attach the items in the database (MET-03); a reference to a zone that is
  // no longer active (data from before, or an archived level) would leave the field without location.
  const activeZones = new Set(data.zones.filter((zone) => zone.status === 'active').map((zone) => zone.id));
  const orphans = [
    ...data.objects.filter((object) => object.status !== 'archived'),
    ...data.risks.filter((risk) => risk.status === 'active'),
  ].filter((item) => item.zone_id !== null && !activeZones.has(item.zone_id));
  add(
    'zone_references',
    orphans.length > 0 ? 'error' : 'ok',
    'Rattachement aux zones',
    orphans.length > 0
      ? `${plural(orphans.length, 'élément est rattaché', 'éléments sont rattachés')} à une zone archivée : replacez-les ou choisissez une autre zone (onglet Plans).`
      : 'Chaque élément rattaché à une zone l’est à une zone active.',
  );

  const opsContacts = data.contacts.filter((contact) => contact.status === 'active' && contact.visibility === 'ops');
  const oldest = now.getTime() - CONTACT_CHECK_DAYS * 86_400_000;
  const unverified = opsContacts.filter(
    (contact) => !contact.verified_at || Date.parse(contact.verified_at) < oldest,
  ).length;
  add(
    'contacts',
    opsContacts.length === 0 || unverified > 0 ? 'warning' : 'ok',
    'Contacts pour les intervenants',
    opsContacts.length === 0
      ? 'Aucun contact visible des intervenants.'
      : unverified > 0
        ? `${plural(unverified, 'contact non vérifié', 'contacts non vérifiés')} depuis plus d’un an.`
        : plural(opsContacts.length, 'contact vérifié', 'contacts vérifiés') + '.',
  );

  const risks = data.risks.filter((risk) => risk.status === 'active');
  add(
    'risks',
    'ok',
    'Risques localisés',
    risks.length === 0
      ? 'Aucun risque déclaré.'
      : `${plural(risks.length, 'risque', 'risques')}, dont ${risks.filter((risk) => risk.plan_position).length} sur plan et ${risks.filter((risk) => risk.geometry).length} sur carte.`,
  );
  // A risk drawn far from the site is most likely misplaced (MET-02).
  const origin = data.site.location?.coordinates;
  const far = origin
    ? risks.filter((risk) => risk.geometry && distanceMeters(origin, firstPosition(risk.geometry)) > FAR_RISK_METERS)
    : [];
  if (far.length > 0) {
    add(
      'risk_locations',
      'warning',
      'Risques loin du site',
      `${far.map((risk) => risk.label ?? risk.type_name).join(', ')} : à plus de ${FAR_RISK_METERS / 1000} km du point de référence, vérifiez leur position sur la carte.`,
    );
  }

  const water = data.objects.filter((object) => object.status !== 'archived' && object.category === 'water').length;
  add(
    'water',
    water > 0 ? 'ok' : 'warning',
    'Points d’eau',
    water > 0 ? plural(water, 'point d’eau', 'points d’eau') + '.' : 'Aucun point d’eau (PEI, réserve, colonne).',
  );

  const documents = data.documents.filter((document) => document.status === 'active');
  const blocked = documents.filter((document) => document.versions[0]?.asset.scan_status !== 'clean');
  add(
    'documents',
    blocked.length > 0 ? 'error' : 'ok',
    'Documents contrôlés',
    blocked.length > 0
      ? `${blocked.map((document) => document.title).join(', ')} : dernière version en contrôle ou refusée.`
      : documents.length === 0
        ? 'Aucun document.'
        : plural(documents.length, 'document prêt', 'documents prêts') + '.',
  );

  const photographed = data.objects.filter((object) => object.status !== 'archived');
  const photos = photographed.flatMap((object) => object.photos.filter((photo) => photo.status === 'active'));
  const unready = photographed.filter((object) =>
    object.photos.some((photo) => photo.status === 'active' && photo.asset.scan_status !== 'clean'),
  );
  add(
    'photos',
    unready.length > 0 ? 'error' : 'ok',
    'Photos contrôlées',
    unready.length > 0
      ? `${unready.map((object) => object.label ?? object.name ?? object.type_name).join(', ')} : photo en cours de contrôle ou refusée.`
      : photos.length === 0
        ? 'Aucune photo.'
        : plural(photos.length, 'photo prête', 'photos prêtes') + '.',
  );
  return checks;
}

const LABELS: Readonly<Record<Exclude<EtareSection, 'site'>, (item: Record<string, unknown>) => string>> = {
  classifications: (item) => String(item['label'] ?? item['code'] ?? 'Classement'),
  buildings: (item) => String(item['name']),
  contacts: (item) => String(item['name']),
  plans: (item) => String(item['title']),
  zones: (item) => String(item['name']),
  objects: (item) => [item['type_name'], item['label'] ?? item['name']].filter(Boolean).join(' · '),
  risks: (item) => [item['type_name'], item['label']].filter(Boolean).join(' · '),
  documents: (item) => String(item['title']),
};

/** Elements added, removed or modified between two snapshots, compared by stable identifier (WF-03 basis). */
export function compareSnapshots(base: EtareSnapshot, next: EtareSnapshot): EtareChange[] {
  const changes: EtareChange[] = [];
  if (canonicalJson(base.site) !== canonicalJson(next.site)) {
    changes.push({ section: 'site', id: next.site.id, label: 'Fiche du site', change: 'modified' });
  }
  for (const section of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
    const before = new Map<string, Record<string, unknown>>(base[section].map((item) => [item.id, item]));
    const after = new Map<string, Record<string, unknown>>(next[section].map((item) => [item.id, item]));
    for (const [id, item] of after) {
      const previous = before.get(id);
      if (!previous) changes.push({ section, id, label: LABELS[section](item), change: 'added' });
      else if (canonicalJson(previous) !== canonicalJson(item)) {
        changes.push({ section, id, label: LABELS[section](item), change: 'modified' });
      }
    }
    for (const [id, item] of before) {
      if (!after.has(id)) changes.push({ section, id, label: LABELS[section](item), change: 'removed' });
    }
  }
  return changes;
}
