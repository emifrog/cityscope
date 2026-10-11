import type { ContributionTarget } from '@etare/domain';
import { Building2, CircleHelp, FileText, Map, Phone, type LucideIcon } from 'lucide-react';

/** A pictogram per target of a proposal, wherever a contribution is listed or opened. */
export const CONTRIBUTION_TARGET_ICONS: Readonly<Record<ContributionTarget, LucideIcon>> = {
  site: Building2,
  contact: Phone,
  plan: Map,
  document: FileText,
  other: CircleHelp,
};
