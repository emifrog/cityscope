/// Lecture JSON défensive et compatible `strict-casts`.
///
/// Toute divergence avec le contrat attendu lève une [FormatException]
/// indiquant le champ fautif ; les couches réseau la convertissent ensuite
/// en erreur typée.
library;

typedef JsonMap = Map<String, Object?>;

/// Vérifie que [value] est un objet JSON.
JsonMap asJsonMap(Object? value, [String context = 'réponse']) =>
    switch (value) {
      final Map<String, Object?> map => map,
      _ => throw FormatException('$context : objet JSON attendu'),
    };

extension JsonMapReader on JsonMap {
  String requireString(String key) => switch (this[key]) {
    final String value => value,
    _ => throw FormatException('« $key » : chaîne attendue'),
  };

  String? optionalString(String key) => switch (this[key]) {
    null => null,
    final String value => value,
    _ => throw FormatException('« $key » : chaîne ou null attendu'),
  };

  int? optionalInt(String key) => switch (this[key]) {
    null => null,
    final int value => value,
    // Certains sérialiseurs émettent 3600.0 pour un entier.
    final double value when value == value.truncateToDouble() => value.toInt(),
    _ => throw FormatException('« $key » : entier ou null attendu'),
  };

  DateTime requireDateTime(String key) {
    final raw = requireString(key);
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      throw FormatException('« $key » : date ISO-8601 attendue');
    }
    return parsed;
  }

  JsonMap requireObject(String key) => asJsonMap(this[key], '« $key »');

  JsonMap? optionalObject(String key) =>
      this[key] == null ? null : asJsonMap(this[key], '« $key »');

  List<JsonMap> requireObjectList(String key) => switch (this[key]) {
    final List<Object?> list => [
      for (final (index, item) in list.indexed)
        asJsonMap(item, '« $key »[$index]'),
    ],
    _ => throw FormatException('« $key » : liste attendue'),
  };

  List<String> requireStringList(String key) => switch (this[key]) {
    final List<Object?> list => [
      for (final item in list)
        item is String
            ? item
            : throw FormatException('« $key » : liste de chaînes attendue'),
    ],
    _ => throw FormatException('« $key » : liste attendue'),
  };

  List<double> requireNumberList(String key) => switch (this[key]) {
    final List<Object?> list => [
      for (final item in list)
        item is num
            ? item.toDouble()
            : throw FormatException('« $key » : liste de nombres attendue'),
    ],
    _ => throw FormatException('« $key » : liste attendue'),
  };
}
