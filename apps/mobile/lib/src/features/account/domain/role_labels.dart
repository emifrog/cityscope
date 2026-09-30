/// Libellés français des rôles connus (RBAC initial du produit).
///
/// Un rôle inconnu de cette version est affiché tel quel plutôt que masqué.
const Map<String, String> _roleLabels = {
  'SUPER_ADMIN': 'Super-administrateur',
  'SIS_ADMIN': 'Administrateur SIS',
  'PREVISION_EDITOR': 'Rédacteur prévision',
  'PREVISION_VALIDATOR': 'Valideur prévision',
  'OPS_USER': 'Opérationnel',
  'EXPLOITANT': 'Exploitant',
  'READER': 'Lecteur',
};

String roleLabel(String code) => _roleLabels[code] ?? code;
