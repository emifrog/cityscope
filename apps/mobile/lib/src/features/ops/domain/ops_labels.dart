import 'package:material_ui/material_ui.dart';

/// Libellés et couleurs du terrain, alignés sur le back-office web
/// (`apps/web/src/components/labels.ts`, calques des plans).

const objectCategoryLabels = <String, String>{
  'access': 'Accès',
  'water': 'Eau',
  'energy': 'Énergie',
  'safety': 'Sécurité incendie',
  'smoke_control': 'Désenfumage',
  'vertical': 'Circulations verticales',
  'risk': 'Risques',
  'refuge': 'Mise à l’abri',
  'communication': 'Liaisons',
  'annotation': 'Annotations',
};

const objectCategoryColors = <String, Color>{
  'access': Color(0xFF15803D),
  'water': Color(0xFF1D4ED8),
  'energy': Color(0xFFB45309),
  'safety': Color(0xFFB91C1C),
  'smoke_control': Color(0xFF7C3AED),
  'vertical': Color(0xFF0F766E),
  'risk': Color(0xFFBE185D),
  'refuge': Color(0xFF0891B2),
  'communication': Color(0xFF475569),
  'annotation': Color(0xFF64748B),
};

const riskColor = Color(0xFFB91C1C);

const zoneTypeLabels = <String, String>{
  'room': 'Local',
  'refuge': 'Zone refuge',
  'technical': 'Local technique',
  'storage': 'Stockage',
  'public': 'Espace recevant du public',
  'circulation': 'Circulation',
  'other': 'Autre zone',
};

const zoneTypeColors = <String, Color>{
  'refuge': Color(0xFF15803D),
  'technical': Color(0xFFB45309),
  'storage': Color(0xFF7C3AED),
  'circulation': Color(0xFF64748B),
};

const planTypeLabels = <String, String>{
  'site': 'Plan de masse',
  'level': 'Plan de niveau',
  'network': 'Plan de réseaux',
  'evacuation': 'Plan d’évacuation',
  'other': 'Autre plan',
};

const severityLabels = <int, String>{
  1: 'Faible',
  2: 'Modérée',
  3: 'Notable',
  4: 'Forte',
  5: 'Majeure',
};

const criticalityLabels = <String, String>{
  'critical': 'Critique',
  'important': 'Important',
  'info': 'Information',
};

const objectStatusLabels = <String, String>{
  'active': 'En service',
  'out_of_service': 'HORS SERVICE',
  'unknown': 'État inconnu',
};

const documentCategoryLabels = <String, String>{
  'fds': 'Fiche de données de sécurité',
  'notice': 'Notice',
  'instruction': 'Consigne',
  'plan': 'Plan',
  'photo': 'Photo',
  'other': 'Autre',
};

const siteTypeLabels = <String, String>{
  'erp': 'ERP',
  'industrial': 'Industriel',
  'health': 'Santé / médico-social',
  'education': 'Enseignement',
  'heritage': 'Patrimoine',
  'other': 'Autre',
};

/// Couleur d'une gravité de risque (1 à 5).
Color severityColor(int severity) => switch (severity) {
  >= 4 => const Color(0xFFB91C1C),
  3 => const Color(0xFFB45309),
  _ => const Color(0xFF475569),
};

/// Couleur d'une criticité de point opérationnel.
Color criticalityColor(String criticality) => switch (criticality) {
  'critical' => const Color(0xFFB91C1C),
  'important' => const Color(0xFFB45309),
  _ => const Color(0xFF475569),
};

/// Les six entrées de la synthèse (maquette, écran 07) et les catégories
/// de points qu'elles regroupent.
enum OpsSection {
  risks('Risques', Icons.warning_amber_rounded, {}),
  access('Accès', Icons.directions, {'access'}),
  plans('Plans', Icons.map_outlined, {}),
  water('Eau', Icons.water_drop_outlined, {'water'}),
  cuts('Coupures', Icons.power_off_outlined, {'energy'}),
  contacts('Contacts', Icons.contact_phone_outlined, {}),
  rescue('Moyens de secours', Icons.health_and_safety_outlined, {
    'safety',
    'smoke_control',
    'vertical',
    'refuge',
    'communication',
  }),
  documents('Documents', Icons.description_outlined, {});

  const OpsSection(this.label, this.icon, this.categories);

  final String label;
  final IconData icon;
  final Set<String> categories;
}

/// « 12 avenue des Mimosas, 06000 Nice » : la commune n'est ajoutée que si
/// l'adresse ne la contient pas déjà.
String addressLine(String? label, String? city) {
  final street = label?.trim() ?? '';
  final town = city?.trim() ?? '';
  if (town.isEmpty) return street;
  if (street.toLowerCase().contains(town.toLowerCase())) return street;
  return street.isEmpty ? town : '$street · $town';
}
