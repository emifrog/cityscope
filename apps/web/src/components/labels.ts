import type {
  ClassificationType,
  PublicationStatus,
  RevisionStatus,
  FieldKind,
  RiskIconKey,
  ZoneType,
  Criticality,
  ObjectCategory,
  ObjectStatus,
  ContactVisibility,
  DocumentCategory,
  MembershipStatus,
  OfflinePolicy,
  PlanType,
  Permission,
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

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  SUPER_ADMIN: 'Exploitation technique de la plateforme, sans accès métier.',
  SIS_ADMIN: 'Comptes, rôles, terminaux et catalogues du SIS. Ne valide ni ne publie sans le rôle validateur.',
  PREVISION_EDITOR: 'Crée et modifie les sites et les ETARE, soumet à validation.',
  PREVISION_VALIDATOR: 'Valide ou refuse les révisions et déclenche la publication.',
  OPS_USER: 'Consulte les versions publiées, y compris hors ligne, et signale les écarts terrain.',
  EXPLOITANT: 'Vue restreinte à ses sites et propositions de mise à jour.',
  READER: 'Lecture seule, sans modification.',
};

/** Actions protected by the second factor (PRIVILEGED_PERMISSIONS). */
export const PRIVILEGED_ACTION_LABELS: Readonly<Partial<Record<Permission, string>>> = {
  'etare:approve': 'valider les révisions ETARE',
  'publication:publish': 'publier une version',
  'member:manage': 'gérer les membres du SIS',
  'device:manage': 'gérer les terminaux',
};

export const MEMBERSHIP_STATUS_LABELS: Readonly<Record<MembershipStatus, string>> = {
  active: 'Actif',
  suspended: 'Suspendu',
  revoked: 'Retiré',
};

export const OBJECT_CATEGORY_LABELS: Readonly<Record<ObjectCategory, string>> = {
  access: 'Accès',
  water: 'Eau',
  energy: 'Énergie',
  safety: 'Sécurité incendie',
  smoke_control: 'Désenfumage',
  vertical: 'Circulations verticales',
  risk: 'Risques',
  refuge: 'Mise à l’abri',
  communication: 'Liaisons',
  annotation: 'Annotations',
};

export const CRITICALITY_LABELS: Readonly<Record<Criticality, string>> = {
  info: 'Information',
  important: 'Important',
  critical: 'Critique',
};

export const OBJECT_STATUS_LABELS: Readonly<Record<ObjectStatus, string>> = {
  active: 'En service',
  out_of_service: 'Hors service',
  unknown: 'État inconnu',
  archived: 'Archivé',
};

export const PLAN_TYPE_LABELS: Readonly<Record<PlanType, string>> = {
  site: 'Plan de masse',
  level: 'Plan de niveau',
  network: 'Plan de réseaux',
  evacuation: 'Plan d’évacuation',
  other: 'Autre plan',
};

export const ZONE_TYPE_LABELS: Readonly<Record<ZoneType, string>> = {
  room: 'Local',
  refuge: 'Zone refuge',
  technical: 'Local technique',
  storage: 'Stockage',
  public: 'Espace recevant du public',
  circulation: 'Circulation',
  other: 'Autre zone',
};

export const RISK_SEVERITY_LABELS: Readonly<Record<number, string>> = {
  1: '1 · faible',
  2: '2 · modérée',
  3: '3 · notable',
  4: '4 · forte',
  5: '5 · majeure',
};

export const RISK_ICON_LABELS: Readonly<Record<RiskIconKey, string>> = {
  'risk-flammable': 'Inflammable',
  'risk-explosive': 'Explosif',
  'risk-toxic': 'Toxique',
  'risk-corrosive': 'Corrosif',
  'risk-oxidizing': 'Comburant',
  'risk-pressurized-gas': 'Gaz sous pression',
  'risk-high-voltage': 'Électrique',
  'risk-lithium': 'Batteries',
  'risk-photovoltaic': 'Photovoltaïque',
  'risk-radioactive': 'Radioactif',
  'risk-biological': 'Biologique',
  'risk-oxygen': 'Oxygène',
  'risk-fragile-structure': 'Structure fragile',
  'risk-vulnerable-public': 'Public vulnérable',
  'risk-heritage': 'Patrimoine',
  'risk-generic': 'Danger',
};

export const FIELD_KIND_LABELS: Readonly<Record<FieldKind, string>> = {
  text: 'Texte',
  number: 'Nombre',
  integer: 'Nombre entier',
  boolean: 'Oui / non',
  date: 'Date',
  choice: 'Liste de choix',
};

export const REVISION_STATUS_LABELS: Readonly<Record<RevisionStatus, string>> = {
  draft: 'Brouillon',
  submitted: 'En attente de validation',
  approved: 'Validée',
  changes_requested: 'Corrections demandées',
  superseded: 'Remplacée',
};

export const PUBLICATION_STATUS_LABELS: Readonly<Record<PublicationStatus, string>> = {
  queued: 'Publication demandée',
  building: 'Fabrication en cours',
  ready: 'Prête',
  published: 'Publiée',
  superseded: 'Remplacée',
  withdrawn: 'Retirée',
  failed: 'Échec de fabrication',
};

export const ETARE_SECTION_LABELS: Readonly<Record<string, string>> = {
  site: 'Site',
  classifications: 'Classements',
  buildings: 'Bâtiments',
  contacts: 'Contacts',
  plans: 'Plans',
  zones: 'Zones',
  objects: 'Points opérationnels',
  risks: 'Risques',
  documents: 'Documents',
};

export const CHANGE_LABELS: Readonly<Record<'added' | 'removed' | 'modified', string>> = {
  added: 'Ajout',
  removed: 'Suppression',
  modified: 'Modification',
};
