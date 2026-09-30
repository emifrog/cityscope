export const SITE_STATUSES = ['draft', 'active', 'inactive', 'archived'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_TYPES = ['erp', 'industrial', 'health', 'education', 'heritage', 'other'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const SENSITIVITY_LEVELS = ['normal', 'restricted', 'high'] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

/**
 * Interior coordinates are local to a plan revision (origin top-left, x to the
 * right, y downwards). Metres are only available once the plan is calibrated.
 */
export const LOCAL_UNITS = ['pixel', 'normalized', 'metre'] as const;
export type LocalUnit = (typeof LOCAL_UNITS)[number];

/** Lifecycle of secondary referential records (buildings, levels, contacts...): never deleted, archived. */
export const RECORD_STATUSES = ['active', 'archived'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const CLASSIFICATION_TYPES = ['ERP', 'IGH', 'ICPE', 'SEVESO', 'ETARE', 'PPI', 'OTHER'] as const;
export type ClassificationType = (typeof CLASSIFICATION_TYPES)[number];

/**
 * Audience of a contact: 'ops' distributed to field terminals, 'prevision'
 * internal to the SIS (default, least exposure), 'operator' shared with the site operator.
 */
export const CONTACT_VISIBILITIES = ['ops', 'prevision', 'operator'] as const;
export type ContactVisibility = (typeof CONTACT_VISIBILITIES)[number];

export const EXTERNAL_ENTITY_TYPES = ['site', 'building', 'operational_object'] as const;
export type ExternalEntityType = (typeof EXTERNAL_ENTITY_TYPES)[number];
