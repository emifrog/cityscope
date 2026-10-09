import type { MeResponse, Membership } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountView } from './account-view';

// The sections talk to the identity provider and the API: stubs here, each has its own tests.
vi.mock('./second-factor-section', () => ({ SecondFactorSection: () => <div data-testid="second-factor" /> }));
vi.mock('./recovery-codes-section', () => ({ RecoveryCodesSection: () => <div data-testid="recovery-codes" /> }));
vi.mock('./sessions-section', () => ({ SessionsSection: () => <div data-testid="sessions" /> }));
vi.mock('./password-section', () => ({ PasswordSection: () => <div data-testid="password" /> }));

const tenant = {
  me: null as MeResponse | null,
  activeTenant: null as Membership | null,
};
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ me: tenant.me, loading: false, activeTenant: tenant.activeTenant, memberships: [] }),
}));

const sdis06: Membership = {
  tenant_id: '01000001-0000-4000-8000-000000000001',
  tenant_slug: 'sdis06',
  tenant_name: 'SDIS des Alpes-Maritimes',
  roles: ['PREVISION_VALIDATOR'],
  second_factor_required: false,
  limited: false,
};
const sdis83: Membership = {
  tenant_id: '01000001-0000-4000-8000-000000000002',
  tenant_slug: 'sdis83',
  tenant_name: 'SDIS du Var',
  roles: ['READER'],
  second_factor_required: true,
  limited: true,
};

function me(overrides: Partial<MeResponse['user']> = {}, memberships: Membership[] = [sdis06, sdis83]): MeResponse {
  return {
    user: {
      id: '02000001-0000-4000-8000-000000000001',
      email: 'validateur06@demo.etare.test',
      display_name: 'Cne Martin',
      second_factor: true,
      second_factor_reenrollment: false,
      ...overrides,
    },
    memberships,
  };
}

describe('AccountView', () => {
  beforeEach(() => {
    tenant.me = me();
    tenant.activeTenant = sdis06;
  });
  afterEach(cleanup);

  it('introduces the person: initials, name, address, active SIS and roles, protection', () => {
    render(<AccountView welcome={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cne Martin' })).toBeTruthy();
    expect(screen.getByText('validateur06@demo.etare.test')).toBeTruthy();
    expect(screen.getByText('CM')).toBeTruthy();
    expect(screen.getByText('Compte protégé')).toBeTruthy();
    expect(screen.getByText('Activée')).toBeTruthy();
    expect(screen.getByTestId('recovery-codes')).toBeTruthy();
    expect(screen.getByTestId('sessions')).toBeTruthy();
    expect(screen.getByTestId('password')).toBeTruthy();
  });

  it('explains every role of every SIS and marks the active one', () => {
    render(<AccountView welcome={false} />);
    expect(screen.getByText('SIS actif')).toBeTruthy();
    expect(screen.getByText('Valide ou refuse les révisions et déclenche la publication.')).toBeTruthy();
    expect(screen.getByText('SDIS du Var')).toBeTruthy();
    expect(screen.getByText('Lecture seule, sans modification.')).toBeTruthy();
    expect(screen.getByText('Périmètre limité à des secteurs ou des sites.')).toBeTruthy();
    expect(screen.getByText('Double authentification exigée pour tout accès.')).toBeTruthy();
  });

  it('says an unprotected account is unprotected, and what the role requires', () => {
    tenant.me = me({ second_factor: false });
    render(<AccountView welcome={true} />);
    expect(screen.getByText('Compte non protégé')).toBeTruthy();
    expect(screen.getByText('Non activée')).toBeTruthy();
    expect(screen.getByText(/^Exigée par votre rôle pour : valider les révisions ETARE/)).toBeTruthy();
    expect(screen.queryByTestId('recovery-codes')).toBeNull();
    expect(screen.getByText(/Votre compte est activé/)).toBeTruthy();
  });

  it('keeps only the way to enroll again when the factor was removed', () => {
    tenant.me = me({ second_factor: false, second_factor_reenrollment: true });
    render(<AccountView welcome={false} />);
    expect(screen.getByText(/Votre double authentification a été retirée/)).toBeTruthy();
    expect(screen.getByTestId('second-factor')).toBeTruthy();
    expect(screen.queryByTestId('sessions')).toBeNull();
  });

  it('shows the address as the name when the SIS gave none', () => {
    tenant.me = me({ display_name: null }, [sdis06]);
    render(<AccountView welcome={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'validateur06@demo.etare.test' })).toBeTruthy();
    expect(screen.getByText('V')).toBeTruthy();
    expect(screen.getAllByText('validateur06@demo.etare.test')).toHaveLength(1);
  });
});
