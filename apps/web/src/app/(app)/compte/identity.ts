/** The name shown for the person: the display name set by the SIS, else the address. */
export function displayNameOf(displayName: string | null, email: string): string {
  const name = displayName?.trim();
  return name ? name : email;
}

/**
 * One or two capital letters for the avatar: initials of the first and last words of the
 * display name (« Cne Martin » → « CM »), else the first letter of the address.
 */
export function initialsOf(displayName: string | null, email: string): string {
  // Words made of letters or digits: « Validateur (06) » gives « V0 », not « V( ».
  const words = (displayName ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return (email.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
