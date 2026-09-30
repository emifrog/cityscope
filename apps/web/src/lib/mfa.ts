'use client';

import { supabaseBrowser } from './supabase-browser';

/**
 * Second authentication factor (TOTP, authenticator application) through
 * Supabase Auth. The API never trusts the browser: it reads the assurance
 * level (aal) from the verified access token and PostgreSQL re-checks it.
 */
export interface TotpFactor {
  readonly id: string;
  readonly friendlyName: string | null;
  readonly createdAt: string;
}

export interface TotpEnrollment {
  readonly factorId: string;
  /** SVG image (data URI) to scan with the authenticator application. */
  readonly qrCode: string;
  /** Same secret, for manual entry. */
  readonly secret: string;
}

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaError';
  }
}

const auth = () => supabaseBrowser().auth;

function fail(error: { code?: string | undefined } | null, fallback: string): never {
  if (error?.code === 'mfa_verification_failed' || error?.code === 'mfa_challenge_expired') {
    throw new MfaError('Code incorrect ou expiré : saisissez le code affiché actuellement par votre application.');
  }
  throw new MfaError(fallback);
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await auth().mfa.listFactors();
  if (error) fail(error, 'Impossible de lire vos facteurs d’authentification.');
  return data.totp.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    createdAt: factor.created_at,
  }));
}

/** Starts an enrollment; abandoned (unverified) enrollments are cleaned up first. */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const { data: factors } = await auth().mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await auth().mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await auth().mfa.enroll({
    factorType: 'totp',
    friendlyName: `Application d’authentification (${new Date().toLocaleDateString('fr-FR')})`,
  });
  if (error) fail(error, 'L’activation de la double authentification a échoué. Réessayez.');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a code: the session is upgraded to aal2 (new access token). */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await auth().mfa.challengeAndVerify({ factorId, code });
  if (error) fail(error, 'La vérification a échoué. Réessayez.');
}

/** Removes a factor (requires aal2), then refreshes the session so that it no longer lists it. */
export async function removeTotpFactor(factorId: string): Promise<void> {
  const { error } = await auth().mfa.unenroll({ factorId });
  if (error) fail(error, 'Le retrait du facteur a échoué. Réessayez.');
  await auth().refreshSession();
}

/** Does this session still have to present its second factor? */
export async function needsSecondFactor(): Promise<boolean> {
  const { data } = await auth().mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}
