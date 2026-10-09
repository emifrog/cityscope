/**
 * Roles and permissions. The database (app.role_permission) is the authority;
 * this mirror lets the UI and use cases reason about capabilities, and an
 * integration test checks that both stay identical.
 */
export const ROLES = [
  'SUPER_ADMIN',
  'SIS_ADMIN',
  'PREVISION_EDITOR',
  'PREVISION_VALIDATOR',
  'OPS_USER',
  'EXPLOITANT',
  'READER',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'site:read',
  'site:write',
  'etare:read',
  'etare:edit',
  'etare:submit',
  'etare:approve',
  'publication:publish',
  'publication:read',
  'offline:download',
  'field_report:create',
  'field_report:review',
  'contribution:create',
  'contribution:review',
  'portal:read',
  'portal:invite',
  'audit:read',
  'member:manage',
  'device:manage',
  'catalog:manage',
  'export:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that require a second authentication factor (aal2). */
export const PRIVILEGED_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'etare:approve',
  'publication:publish',
  'member:manage',
  'device:manage',
  'portal:invite',
  'export:manage',
]);

/**
 * Portal permissions of the exploitants: they need the second factor when the
 * SIS requires it (tenant setting, required by default, ADR-019).
 */
export const PORTAL_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(['portal:read', 'contribution:create']);

/**
 * Roles a SIS administrator may grant to a whole SIS (mirrors app.grantable_role_ids):
 * never the platform role, never EXPLOITANT, which is always limited to sites.
 */
export const TENANT_WIDE_ROLES = [
  'SIS_ADMIN',
  'PREVISION_EDITOR',
  'PREVISION_VALIDATOR',
  'OPS_USER',
  'READER',
] as const satisfies readonly Role[];
export type TenantWideRole = (typeof TENANT_WIDE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  // Platform operations only: never any access to business data.
  SUPER_ADMIN: [],
  // Administers the SIS but cannot validate nor publish without the validator role.
  SIS_ADMIN: [
    'site:read',
    'site:write',
    'etare:read',
    'etare:edit',
    'publication:read',
    'offline:download',
    'field_report:review',
    'contribution:review',
    'portal:invite',
    'audit:read',
    'member:manage',
    'device:manage',
    'catalog:manage',
    'export:manage',
  ],
  // Offline download for the back-office roles too (cahier des charges §3.1, Sprint 4).
  PREVISION_EDITOR: [
    'site:read',
    'site:write',
    'etare:read',
    'etare:edit',
    'etare:submit',
    'publication:read',
    'offline:download',
    'field_report:review',
    'contribution:review',
    'portal:invite',
  ],
  PREVISION_VALIDATOR: [
    'site:read',
    'etare:read',
    'etare:approve',
    'publication:publish',
    'publication:read',
    'offline:download',
    'field_report:review',
    'contribution:review',
  ],
  OPS_USER: ['publication:read', 'offline:download', 'field_report:create'],
  EXPLOITANT: ['portal:read', 'contribution:create'],
  READER: ['site:read', 'etare:read', 'publication:read'],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((role) => DEFAULT_ROLE_PERMISSIONS[role]));
}
