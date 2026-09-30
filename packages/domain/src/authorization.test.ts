import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PRIVILEGED_PERMISSIONS,
  ROLES,
  isPermission,
  isRole,
  permissionsForRoles,
} from './authorization';

describe('roles and permissions', () => {
  it('declares the fundamental roles of the MVP', () => {
    expect(ROLES).toEqual([
      'SUPER_ADMIN',
      'SIS_ADMIN',
      'PREVISION_EDITOR',
      'PREVISION_VALIDATOR',
      'OPS_USER',
      'EXPLOITANT',
      'READER',
    ]);
  });

  it('gives no business permission to the platform administrator', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual([]);
  });

  it('separates writing from validating (editor != validator)', () => {
    const editor = permissionsForRoles(['PREVISION_EDITOR']);
    const validator = permissionsForRoles(['PREVISION_VALIDATOR']);
    expect(editor.has('etare:edit')).toBe(true);
    expect(editor.has('etare:approve')).toBe(false);
    expect(editor.has('publication:publish')).toBe(false);
    expect(validator.has('etare:approve')).toBe(true);
    expect(validator.has('etare:edit')).toBe(false);
  });

  it('does not let the SIS administrator publish without the validator role', () => {
    const admin = permissionsForRoles(['SIS_ADMIN']);
    expect(admin.has('etare:approve')).toBe(false);
    expect(admin.has('publication:publish')).toBe(false);
  });

  it('keeps OPS users away from working data', () => {
    const ops = permissionsForRoles(['OPS_USER']);
    expect(ops.has('site:read')).toBe(false);
    expect(ops.has('publication:read')).toBe(true);
  });

  it('only references known permissions', () => {
    for (const role of ROLES) {
      for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
    for (const permission of PRIVILEGED_PERMISSIONS) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it('guards untrusted strings', () => {
    expect(isRole('READER')).toBe(true);
    expect(isRole('ROOT')).toBe(false);
    expect(isPermission('site:read')).toBe(true);
    expect(isPermission('site:delete')).toBe(false);
  });
});
