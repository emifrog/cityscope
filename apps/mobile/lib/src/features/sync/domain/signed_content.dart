import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:flutter/foundation.dart';

/// Lignes de contexte des textes signés (ADR-015) : une signature faite pour
/// un usage n'est valable pour aucun autre. Identiques côté serveur
/// (`packages/domain/src/distribution.ts`).
abstract final class SignatureContexts {
  static const manifest = 'etare.manifest.v1';
  static const catalog = 'etare.catalog.v1';
  static const deviceRequest = 'etare.device-request.v1';
  static const enrollment = 'etare.enrollment.v1';
}

/// SHA-256 d'un corps vide (requêtes GET signées).
const emptyBodySha256 =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/// Le texte exact qui est signé : la ligne de contexte, puis le contenu.
String signedText(String context, String content) => '$context\n$content';

/// Ce que la tablette signe pour chaque requête de synchronisation.
String deviceRequestText({
  required String method,
  required String path,
  required int timestamp,
  required String bodySha256,
}) => signedText(
  SignatureContexts.deviceRequest,
  [method.toUpperCase(), path, '$timestamp', bodySha256].join('\n'),
);

/// Ce que la tablette signe à l'enrôlement : preuve de détention de sa clé.
String enrollmentText({
  required String tenantId,
  required String code,
  required String publicKey,
}) => signedText(
  SignatureContexts.enrollment,
  [tenantId, code, publicKey].join('\n'),
);

/// Signature détachée reçue du serveur : algorithme, clé, valeur (base64).
@immutable
final class SignatureEnvelope {
  const SignatureEnvelope({
    required this.algorithm,
    required this.keyId,
    required this.signature,
  });

  factory SignatureEnvelope.fromJson(JsonMap json) => SignatureEnvelope(
    algorithm: json.requireString('algorithm'),
    keyId: json.requireString('key_id'),
    signature: json.requireString('signature'),
  );

  final String algorithm;
  final String keyId;
  final String signature;
}

/// Code d'enrôlement tel que saisi : casse, espaces et tirets ignorés.
/// `null` si ce ne peut pas être un code (12 caractères sans I, O, 0, 1).
String? normalizeEnrollmentCode(String input) {
  final code = input.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
  return RegExp(r'^[A-HJ-NP-Z2-9]{12}$').hasMatch(code) ? code : null;
}
