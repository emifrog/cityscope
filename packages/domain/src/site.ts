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
