import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:flutter/foundation.dart';

/// Raison pour laquelle un site détenu par la tablette en disparaît, telle
/// que le catalogue signé l'indique : version retirée par un validateur ou
/// site archivé (MET-04), site sorti du périmètre de la tablette ou de
/// l'agent (PER-01), quand et pourquoi.
@immutable
final class RemovalNotice {
  const RemovalNotice({
    required this.siteId,
    required this.siteName,
    required this.kind,
    required this.at,
    required this.reason,
  });

  factory RemovalNotice.fromJson(JsonMap json) {
    // Un motif inconnu (serveur plus récent) reste lisible : le site est retiré
    // quand même, l'avis le dit sans détailler.
    final kind = json.requireString('kind');
    return RemovalNotice(
      siteId: json.requireString('site_id'),
      siteName: json.requireString('site_name'),
      kind: kind,
      at: json.requireDateTime('at').toUtc(),
      reason: json.requireString('reason'),
    );
  }

  final String siteId;
  final String siteName;

  /// `withdrawn` (version retirée), `archived` (site archivé) ou
  /// `perimeter` (hors du périmètre de la tablette ou de l'agent).
  final String kind;
  final DateTime at;
  final String reason;

  /// Libellé court pour l'agent.
  String get label => switch (kind) {
    'archived' => 'Site archivé par le SIS',
    'withdrawn' => 'Version retirée par le SIS',
    'perimeter' => 'Retiré de votre périmètre',
    _ => 'Retiré de la tablette',
  };

  JsonMap toJson() => {
    'site_id': siteId,
    'site_name': siteName,
    'kind': kind,
    'at': at.toIso8601String(),
    'reason': reason,
  };
}

/// Avis conservés sur la tablette (les plus récents d'abord, nombre borné).
const maxRemovalNotices = 20;

/// Fusionne les avis : ceux des sites réinstallés disparaissent, les nouveaux
/// remplacent les anciens du même site.
List<RemovalNotice> mergeRemovalNotices(
  List<RemovalNotice> current,
  List<RemovalNotice> added, {
  Set<String> reinstalled = const {},
}) {
  final replaced = {for (final notice in added) notice.siteId};
  final merged =
      [
          ...added,
          for (final notice in current)
            if (!replaced.contains(notice.siteId)) notice,
        ].where((notice) => !reinstalled.contains(notice.siteId)).toList()
        ..sort((a, b) => b.at.compareTo(a.at));
  return merged.take(maxRemovalNotices).toList(growable: false);
}

String encodeRemovalNotices(List<RemovalNotice> notices) =>
    jsonEncode([for (final notice in notices) notice.toJson()]);

/// Lecture tolérante : un contenu illisible ne bloque rien, il est ignoré.
List<RemovalNotice> decodeRemovalNotices(String? text) {
  if (text == null || text.isEmpty) return const [];
  try {
    final list = jsonDecode(text);
    if (list is! List<Object?>) return const [];
    return [
      for (final item in list)
        if (item is Map<String, Object?>) RemovalNotice.fromJson(item),
    ];
  } on FormatException {
    return const [];
  }
}
