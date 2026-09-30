import 'dart:io';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';

/// Convertit une [DioException] en erreur applicative typée
/// ([NetworkException], [ApiException] ou [UnexpectedResponseException]).
AppException mapDioException(DioException error) {
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
      return const NetworkException(NetworkFailure.timeout, 'Délai dépassé');
    case DioExceptionType.connectionError:
      return const NetworkException(NetworkFailure.offline, 'Hôte injoignable');
    case DioExceptionType.badCertificate:
      return const NetworkException(
        NetworkFailure.badCertificate,
        'Certificat refusé',
      );
    case DioExceptionType.cancel:
      return const NetworkException(NetworkFailure.cancelled, 'Annulée');
    case DioExceptionType.badResponse:
      final response = error.response;
      return parseApiError(response?.statusCode, response?.data);
    case DioExceptionType.unknown:
      final cause = error.error;
      if (cause is SocketException || cause is HttpException) {
        return const NetworkException(NetworkFailure.offline, 'Erreur socket');
      }
      if (cause is AppException) return cause;
      return UnexpectedResponseException(
        'Erreur HTTP inattendue : ${error.message ?? cause}',
      );
  }
}

/// Décode une enveloppe d'erreur de l'API produit :
/// `{"error":{"code","message","trace_id","fields":[{"path","message"}]}}`.
///
/// Si le corps n'est pas au format attendu (proxy, page HTML…), le code est
/// déduit du statut HTTP.
ApiException parseApiError(int? statusCode, Object? body) {
  try {
    final envelope = asJsonMap(body).requireObject('error');
    final rawFields = envelope['fields'] == null
        ? const <JsonMap>[]
        : envelope.requireObjectList('fields');
    return ApiException(
      statusCode: statusCode,
      code: ApiErrorCode.fromWire(envelope.optionalString('code')),
      message: envelope.optionalString('message') ?? 'Erreur API',
      traceId: envelope.optionalString('trace_id'),
      fields: [
        for (final field in rawFields)
          ApiFieldError(
            path: field.optionalString('path') ?? '',
            message: field.optionalString('message') ?? '',
          ),
      ],
    );
  } on FormatException {
    return ApiException(
      statusCode: statusCode,
      code: ApiErrorCode.fromStatus(statusCode),
      message: 'Réponse d’erreur HTTP $statusCode sans enveloppe standard',
    );
  }
}
