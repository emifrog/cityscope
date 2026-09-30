import type { IdentityProvisioner } from '@etare/application';
import { ServiceUnavailable } from '@etare/domain';
import { createClient } from '@supabase/supabase-js';

type AdminResult = Promise<{ data: { user: { id: string } | null }; error: unknown }>;

/** Minimal auth administration API used here (structurally satisfied by supabase-js GoTrueAdminApi). */
export interface AuthAdminApi {
  inviteUserByEmail(email: string, options?: { data?: object }): AdminResult;
  generateLink(params: { type: 'magiclink'; email: string }): AdminResult;
}

/**
 * Creates identities in Supabase Auth with the server-side secret key. The
 * invitation e-mail uses the project template (supabase/templates/invite.html),
 * whose link opens /auth/confirm on the web application.
 */
export class SupabaseIdentityProvisioner implements IdentityProvisioner {
  constructor(private readonly admin: AuthAdminApi) {}

  static fromSecretKey(url: string, secretKey: string): SupabaseIdentityProvisioner {
    const client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return new SupabaseIdentityProvisioner(client.auth.admin);
  }

  async invite(email: string, displayName: string | null): Promise<{ subject: string; invitationSent: boolean }> {
    const invited = await this.admin.inviteUserByEmail(
      email,
      displayName ? { data: { display_name: displayName } } : {},
    );
    if (!invited.error && invited.data.user) return { subject: invited.data.user.id, invitationSent: true };

    if (isEmailTaken(invited.error)) {
      // The address already has an identity (e.g. an earlier invitation interrupted before being
      // attached): resolve its id without sending anything; the generated link is discarded.
      const existing = await this.admin.generateLink({ type: 'magiclink', email });
      if (!existing.error && existing.data.user) return { subject: existing.data.user.id, invitationSent: false };
    }
    throw new ServiceUnavailable('Le service d’authentification n’a pas pu créer l’invitation. Réessayez plus tard.');
  }
}

function isEmailTaken(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return code === 'email_exists' || /already (been )?registered/i.test(message);
}
