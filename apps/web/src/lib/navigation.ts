/** Only relative, same-origin paths are accepted as post-login destinations (no open redirect). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // Never back to an authentication step.
  if (['/login', '/verification', '/auth/'].some((prefix) => value.startsWith(prefix))) return '/';
  return value;
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Planned sprint when the module is not available yet. */
  readonly comingIn?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/carte', label: 'Carte' },
  { href: '/sites', label: 'Sites' },
  { href: '/etare', label: 'ETARE', comingIn: 'Sprint 3' },
  { href: '/validations', label: 'Validations', comingIn: 'Sprint 3' },
  { href: '/signalements', label: 'Signalements', comingIn: 'Sprint 5' },
  { href: '/contributions', label: 'Contributions', comingIn: 'Sprint 5' },
  { href: '/administration', label: 'Administration' },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
