/// Normalisation pour la recherche locale (OPS-03) : minuscules, sans accents
/// ni ponctuation, espaces simples. « Établissement Saint-Éloi » et
/// « etablissement saint eloi » se retrouvent.
String normalizeForSearch(String input) {
  final buffer = StringBuffer();
  for (final rune in input.toLowerCase().runes) {
    final character = String.fromCharCode(rune);
    buffer.write(_folded[character] ?? character);
  }
  return buffer.toString().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}

const _folded = <String, String>{
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', //
  'ç': 'c', //
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', //
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', //
  'ñ': 'n', //
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', //
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', //
  'ý': 'y', 'ÿ': 'y', //
  'œ': 'oe', 'æ': 'ae', //
  '’': ' ', "'": ' ',
};
