import type {
  ClassificationType,
  ContactVisibility,
  DocumentCategory,
  OfflinePolicy,
  RecordStatus,
  Role,
  ScanStatus,
  Sensitivity,
  SiteStatus,
  SiteType,
} from '@etare/domain';

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

export const CLASSIFICATION_TYPE_LABELS: Readonly<Record<ClassificationType, string>> = {
  ERP: 'ERP',
  IGH: 'IGH',
  ICPE: 'ICPE',
  SEVESO: 'SEVESO',
  ETARE: 'ETARE',
  PPI: 'PPI',
  OTHER: 'Autre',
};

export const CONTACT_VISIBILITY_LABELS: Readonly<Record<ContactVisibility, string>> = {
  ops: 'Diffusé aux intervenants',
  prevision: 'Interne au SIS',
  operator: 'Partagé avec l’exploitant',
};

export const RECORD_STATUS_LABELS: Readonly<Record<RecordStatus, string>> = {
  active: 'Actif',
  archived: 'Archivé',
};

export const DOCUMENT_CATEGORY_LABELS: Readonly<Record<DocumentCategory, string>> = {
  fds: 'Fiche de données de sécurité',
  notice: 'Notice',
  instruction: 'Consigne',
  plan: 'Plan',
  photo: 'Photo',
  other: 'Autre',
};

export const OFFLINE_POLICY_LABELS: Readonly<Record<OfflinePolicy, string>> = {
  never: 'Pas de consultation hors ligne',
  on_demand: 'Hors ligne à la demande',
  always: 'Toujours embarqué hors ligne',
};

export const SCAN_STATUS_LABELS: Readonly<Record<ScanStatus, string>> = {
  pending: 'Contrôle en cours',
  clean: 'Contrôlé',
  rejected: 'Refusé',
};

/** Reasons given by the worker when it refuses a file. */
export const REJECTION_REASON_LABELS: Readonly<Record<string, string>> = {
  SIZE_MISMATCH: 'la taille reçue ne correspond pas à celle annoncée',
  SHA256_MISMATCH: 'le contenu reçu diffère du fichier choisi (envoi altéré)',
  TYPE_MISMATCH: 'le contenu réel ne correspond pas au type annoncé',
  MALWARE: 'un contenu malveillant a été détecté',
};
