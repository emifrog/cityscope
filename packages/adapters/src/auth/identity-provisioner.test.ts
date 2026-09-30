import { ServiceUnavailable } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseIdentityProvisioner, type AuthAdminApi } from './identity-provisioner';

const user = (id: string) => ({ data: { user: { id } }, error: null });
const failure = (error: object) => ({ data: { user: null }, error });

function admin(invite: Awaited<ReturnType<AuthAdminApi['inviteUserByEmail']>>) {
  return {
    inviteUserByEmail: vi.fn<AuthAdminApi['inviteUserByEmail']>(async () => invite),
    generateLink: vi.fn<AuthAdminApi['generateLink']>(async () => user('existing-id')),
  };
}

describe('SupabaseIdentityProvisioner', () => {
  it('invites a new address and keeps the display name as metadata', async () => {
    const api = admin(user('new-id'));
    await expect(new SupabaseIdentityProvisioner(api).invite('a@demo.etare.test', 'Agent A')).resolves.toEqual({
      subject: 'new-id',
      invitationSent: true,
    });
    expect(api.inviteUserByEmail).toHaveBeenCalledWith('a@demo.etare.test', { data: { display_name: 'Agent A' } });
    expect(api.generateLink).not.toHaveBeenCalled();
  });

  it('resolves an address that already has an identity without sending anything', async () => {
    const api = admin(failure({ code: 'email_exists', status: 422, message: 'already registered' }));
    await expect(new SupabaseIdentityProvisioner(api).invite('a@demo.etare.test', null)).resolves.toEqual({
      subject: 'existing-id',
      invitationSent: false,
    });
  });

  it('reports other provider failures as a temporary unavailability', async () => {
    const api = admin(failure({ code: 'over_email_send_rate_limit', status: 429 }));
    await expect(new SupabaseIdentityProvisioner(api).invite('a@demo.etare.test', null)).rejects.toBeInstanceOf(
      ServiceUnavailable,
    );
  });
});
