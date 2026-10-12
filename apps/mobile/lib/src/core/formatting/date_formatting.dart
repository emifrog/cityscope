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

/// Ancienneté lisible d'un instant passé : `à l’instant`, `il y a 5 min`,
/// `il y a 3 h`, `hier`, `avant-hier`, `il y a 5 jours`, `il y a 3 semaines`,
/// puis la date (`le 12/10/2026`) au-delà d'un mois.
String formatRelativeFr(DateTime value, DateTime now) {
  final elapsed = now.difference(value);
  if (elapsed.inSeconds < 60) return 'à l’instant';
  if (elapsed.inMinutes < 60) return 'il y a ${elapsed.inMinutes} min';
  if (elapsed.inHours < 24) return 'il y a ${elapsed.inHours} h';
  final local = value.toLocal();
  final today = DateTime(
    now.toLocal().year,
    now.toLocal().month,
    now.toLocal().day,
  );
  final day = DateTime(local.year, local.month, local.day);
  final days = today.difference(day).inDays;
  if (days <= 1) return 'hier';
  if (days == 2) return 'avant-hier';
  if (days < 7) return 'il y a $days jours';
  if (days < 30) {
    final weeks = days ~/ 7;
    return weeks == 1 ? 'il y a une semaine' : 'il y a $weeks semaines';
  }
  return 'le ${formatDateFr(value)}';
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
