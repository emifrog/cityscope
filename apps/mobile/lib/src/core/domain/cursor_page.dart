import 'package:flutter/foundation.dart';

/// Page de résultats paginée par curseur opaque.
@immutable
final class CursorPage<T> {
  const CursorPage({required this.items, this.nextCursor});

  final List<T> items;

  /// Curseur à renvoyer pour obtenir la page suivante ; `null` en fin de liste.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}
