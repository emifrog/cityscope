import { ROLES } from '@etare/domain';
import { z } from 'zod';

export const roleSchema = z.enum(ROLES);

/** Login form. Password rules are enforced by the identity provider; here only bounds. */
export const loginSchema = z.object({
  email: z.email('Adresse e-mail invalide.').max(254),
  password: z.string().min(1, 'Mot de passe requis.').max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;
