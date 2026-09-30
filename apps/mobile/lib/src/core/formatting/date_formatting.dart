/// Formate une date en heure locale : `27/09/2026 à 10:05`.
///
/// Volontairement sans dépendance à `intl` tant qu'un seul format est requis.
String formatDateTimeFr(DateTime value) {
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year} '
      'à ${two(local.hour)}:${two(local.minute)}';
}
