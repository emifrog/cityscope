/// Ordre des listes, identique à l'aperçu et au PDF (ADR-026) :
/// `packages/domain/src/etare-layout.ts` fait le même calcul en TypeScript.
library;

const _folded = <String, String>{
  'à': 'a',
  'â': 'a',
  'ä': 'a',
  'á': 'a',
  'ç': 'c',
  'é': 'e',
  'è': 'e',
  'ê': 'e',
  'ë': 'e',
  'î': 'i',
  'ï': 'i',
  'í': 'i',
  'ô': 'o',
  'ö': 'o',
  'ó': 'o',
  'ù': 'u',
  'û': 'u',
  'ü': 'u',
  'ú': 'u',
  'ÿ': 'y',
  'ñ': 'n',
  'œ': 'oe',
  'æ': 'ae',
};

/// Clé en minuscules sans accents : même ordre quelle que soit la
/// collation de l'appareil.
String sortKey(String text) => text
    .toLowerCase()
    .split('')
    .map((character) => _folded[character] ?? character)
    .join();

int _compareText(String left, String right) => left.compareTo(right);

int _criticalityRank(String criticality) => switch (criticality) {
  'critical' => 0,
  'important' => 1,
  _ => 2,
};

/// Criticité, puis titre, puis identifiant.
int compareObjectParts({
  required String leftId,
  required String leftCriticality,
  required String leftTitle,
  required String rightId,
  required String rightCriticality,
  required String rightTitle,
}) {
  final byCriticality = _criticalityRank(leftCriticality)
      .compareTo(_criticalityRank(rightCriticality));
  if (byCriticality != 0) return byCriticality;
  final byTitle = _compareText(sortKey(leftTitle), sortKey(rightTitle));
  if (byTitle != 0) return byTitle;
  return _compareText(leftId, rightId);
}

/// Gravité décroissante, puis titre, puis identifiant.
int compareRiskParts({
  required String leftId,
  required int leftSeverity,
  required String leftTitle,
  required String rightId,
  required int rightSeverity,
  required String rightTitle,
}) {
  final bySeverity = rightSeverity.compareTo(leftSeverity);
  if (bySeverity != 0) return bySeverity;
  final byTitle = _compareText(sortKey(leftTitle), sortKey(rightTitle));
  if (byTitle != 0) return byTitle;
  return _compareText(leftId, rightId);
}
