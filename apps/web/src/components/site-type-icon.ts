import type { SiteType } from '@etare/domain';
import { Building2, Factory, HeartPulse, Landmark, School, Store, type LucideIcon } from 'lucide-react';

/** A pictogram per family of site, used wherever a site is named (fiche, listes). */
export const SITE_TYPE_ICONS: Readonly<Record<SiteType, LucideIcon>> = {
  erp: Store,
  industrial: Factory,
  health: HeartPulse,
  education: School,
  heritage: Landmark,
  other: Building2,
};
