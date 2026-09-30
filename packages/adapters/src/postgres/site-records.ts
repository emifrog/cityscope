import type { ClassificationRepository, ContactRepository, ExternalIdRepository } from '@etare/application';
import {
  classificationSchema,
  contactSchema,
  externalIdSchema,
  type Classification,
  type ClassificationCreate,
  type ClassificationUpdate,
  type Contact,
  type ContactCreate,
  type ContactUpdate,
  type ExternalId,
  type ExternalIdCreate,
} from '@etare/contracts';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion, toIso } from './versioned';

/** Records attached to a site: they can only be created on a site visible in the current SIS. */
async function siteIsVisible(client: PoolClient, siteId: string): Promise<boolean> {
  const result = await client.query('select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()', [
    siteId,
  ]);
  return result.rowCount === 1;
}

// ------------------------------------------------------------------ classifications
const CLASSIFICATION_COLUMNS = `id, site_id, classification_type, code, category, label,
  valid_from::text as valid_from, valid_to::text as valid_to, source, row_version`;

export class PostgresClassificationRepository implements ClassificationRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Classification[]> {
    const result = await this.client.query(
      `select ${CLASSIFICATION_COLUMNS} from app.site_classification
       where site_id = $1 and tenant_id = app.current_tenant_id()
       order by valid_to nulls first, classification_type, valid_from desc nulls last`,
      [siteId],
    );
    return result.rows.map((row) => classificationSchema.parse(row));
  }

  async create(siteId: string, input: ClassificationCreate): Promise<Classification | null> {
    if (!(await siteIsVisible(this.client, siteId))) return null;
    const result = await this.client.query<{ id: string }>(
      `insert into app.site_classification
         (tenant_id, site_id, classification_type, code, category, label, valid_from, valid_to, source)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        siteId,
        input.classification_type,
        input.code ?? null,
        input.category ?? null,
        input.label ?? null,
        input.valid_from ?? null,
        input.valid_to ?? null,
        input.source ?? null,
      ],
    );
    return this.get(result.rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: ClassificationUpdate): Promise<Classification | null> {
    if (!(await lockVersion(this.client, 'app.site_classification', id, expectedVersion))) return null;
    await applyAssignments(
      this.client,
      'app.site_classification',
      id,
      assignments(patch, {
        classification_type: 'classification_type',
        code: 'code',
        category: 'category',
        label: 'label',
        valid_from: 'valid_from',
        valid_to: 'valid_to',
        source: 'source',
      }),
    );
    return this.get(id);
  }

  private async get(id: string): Promise<Classification | null> {
    const result = await this.client.query(
      `select ${CLASSIFICATION_COLUMNS} from app.site_classification where id = $1 and tenant_id = app.current_tenant_id()`,
      [id],
    );
    return result.rows[0] ? classificationSchema.parse(result.rows[0]) : null;
  }
}

// ------------------------------------------------------------------ contacts
const CONTACT_COLUMNS = `id, site_id, name, role, phone, phone_alt, email::text as email, availability,
  visibility, sort_order, status, verified_at, row_version`;

interface ContactRow extends Omit<Contact, 'verified_at'> {
  verified_at: Date | null;
}

const toContact = (row: ContactRow) => contactSchema.parse({ ...row, verified_at: toIso(row.verified_at) });

export class PostgresContactRepository implements ContactRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Contact[]> {
    const result = await this.client.query<ContactRow>(
      `select ${CONTACT_COLUMNS} from app.contact
       where site_id = $1 and tenant_id = app.current_tenant_id()
       order by status, sort_order, name`,
      [siteId],
    );
    return result.rows.map(toContact);
  }

  async create(siteId: string, input: ContactCreate): Promise<Contact | null> {
    if (!(await siteIsVisible(this.client, siteId))) return null;
    const result = await this.client.query<{ id: string }>(
      `insert into app.contact
         (tenant_id, site_id, name, role, phone, phone_alt, email, availability, visibility, sort_order)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        siteId,
        input.name,
        input.role ?? null,
        input.phone,
        input.phone_alt ?? null,
        input.email ?? null,
        input.availability ?? null,
        input.visibility,
        input.sort_order ?? 0,
      ],
    );
    return this.get(result.rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: ContactUpdate): Promise<Contact | null> {
    if (!(await lockVersion(this.client, 'app.contact', id, expectedVersion))) return null;
    const values = assignments(patch, {
      name: 'name',
      role: 'role',
      phone: 'phone',
      phone_alt: 'phone_alt',
      email: 'email',
      availability: 'availability',
      visibility: 'visibility',
      sort_order: 'sort_order',
      status: 'status',
    });
    // "Verified" is a server timestamp, never a client-supplied date.
    if (patch.verified) values.push({ column: 'verified_at', raw: 'now()' });
    await applyAssignments(this.client, 'app.contact', id, values);
    return this.get(id);
  }

  private async get(id: string): Promise<Contact | null> {
    const result = await this.client.query<ContactRow>(
      `select ${CONTACT_COLUMNS} from app.contact where id = $1 and tenant_id = app.current_tenant_id()`,
      [id],
    );
    return result.rows[0] ? toContact(result.rows[0]) : null;
  }
}

// ------------------------------------------------------------------ external identifiers
const EXTERNAL_ID_COLUMNS = 'id, site_id, entity_type, entity_id, system_code, external_id';

export class PostgresExternalIdRepository implements ExternalIdRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<ExternalId[]> {
    const result = await this.client.query(
      `select ${EXTERNAL_ID_COLUMNS} from app.external_identifier
       where site_id = $1 and tenant_id = app.current_tenant_id()
       order by system_code, external_id`,
      [siteId],
    );
    return result.rows.map((row) => externalIdSchema.parse(row));
  }

  async create(siteId: string, input: ExternalIdCreate): Promise<ExternalId | null> {
    if (!(await siteIsVisible(this.client, siteId))) return null;
    const result = await this.client.query(
      `insert into app.external_identifier (tenant_id, site_id, entity_type, entity_id, system_code, external_id)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5)
       returning ${EXTERNAL_ID_COLUMNS}`,
      [siteId, input.entity_type, input.entity_id, input.system_code, input.external_id],
    );
    return result.rows[0] ? externalIdSchema.parse(result.rows[0]) : null;
  }
}
