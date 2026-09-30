import type { Role, Sensitivity, SiteStatus, SiteType } from '@etare/domain';

export const SITE_TYPE_LABELS: Readonly<Record<SiteType, string>> = {
  erp: 'ERP',
  industrial: 'Industriel',
  health: 'Santé / médico-social',
  education: 'Enseignement',
  heritage: 'Patrimoine',
  other: 'Autre',
};

export const SITE_STATUS_LABELS: Readonly<Record<SiteStatus, string>> = {
  draft: 'Brouillon',
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  SUPER_ADMIN: 'Administrateur plateforme',
  SIS_ADMIN: 'Administrateur SIS',
  PREVISION_EDITOR: 'Rédacteur prévision',
  PREVISION_VALIDATOR: 'Validateur prévision',
  OPS_USER: 'Intervenant OPS',
  EXPLOITANT: 'Exploitant',
  READER: 'Lecteur',
};

export const SENSITIVITY_LABELS: Readonly<Record<Sensitivity, string>> = {
  normal: 'Normale',
  restricted: 'Restreinte',
  high: 'Élevée',
};
