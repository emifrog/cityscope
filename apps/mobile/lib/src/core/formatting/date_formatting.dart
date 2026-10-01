/// Formate une date en heure locale : `27/09/2026 à 10:05`.
///
/// Volontairement sans dépendance à `intl` tant qu'un seul format est requis.
String formatDateTimeFr(DateTime value) {
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year} '
      'à ${two(local.hour)}:${two(local.minute)}';
}

/// Formate une date seule : `27/09/2026`.
String formatDateFr(DateTime value) {
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year}';
}

/// Taille lisible : `512 o`, `12,4 Ko`, `3,1 Mo`, `1,2 Go`.
String formatBytesFr(int bytes) {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final text = unit == 0
      ? value.toStringAsFixed(0)
      : value.toStringAsFixed(1).replaceAll('.', ',');
  return '$text ${units[unit]}';
}
