import { ROLES } from '@etare/domain';
import { z } from 'zod';

export const roleSchema = z.enum(ROLES);

/** Login form. Password rules are enforced by the identity provider; here only bounds. */
export const loginSchema = z.object({
  email: z.email('Adresse e-mail invalide.').max(254),
  password: z.string().min(1, 'Mot de passe requis.').max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * New password, same rules as the identity provider (supabase/config.toml:
 * 12 characters minimum, lower and upper case letters, digits and symbols).
 */
export const newPasswordSchema = z
  .string()
  .min(12, '12 caractères minimum.')
  .max(256)
  .regex(/[a-z]/, 'Au moins une lettre minuscule.')
  .regex(/[A-Z]/, 'Au moins une lettre majuscule.')
  .regex(/[0-9]/, 'Au moins un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Au moins un symbole.');

/** Code of an authenticator application (TOTP, RFC 6238). */
export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, 'Saisissez les 6 chiffres affichés par votre application.');
