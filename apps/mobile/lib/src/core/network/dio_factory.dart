import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:flutter/foundation.dart';

/// Crée un client HTTP configuré de façon homogène (délais, JSON, logs sûrs).
Dio createDio({
  required String baseUrl,
  Map<String, String> headers = const {},
  Duration connectTimeout = const Duration(seconds: 10),
  Duration receiveTimeout = const Duration(seconds: 20),
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: connectTimeout,
      sendTimeout: receiveTimeout,
      receiveTimeout: receiveTimeout,
      responseType: ResponseType.json,
      contentType: Headers.jsonContentType,
      headers: {Headers.acceptHeader: Headers.jsonContentType, ...headers},
    ),
  );
  if (kDebugMode) {
    dio.interceptors.add(SafeLogInterceptor());
  }
  return dio;
}

/// Journalise méthode, chemin et statut uniquement : jamais les en-têtes
/// (Authorization, apikey), les corps (mots de passe, jetons) ni la query.
final class SafeLogInterceptor extends Interceptor {
  SafeLogInterceptor({this._logger = const AppLogger('http')});

  final AppLogger _logger;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    _logger.debug('→ ${options.method} ${options.uri.path}');
    handler.next(options);
  }

  @override
  void onResponse(
    Response<Object?> response,
    ResponseInterceptorHandler handler,
  ) {
    final request = response.requestOptions;
    _logger.debug(
      '← ${response.statusCode} ${request.method} ${request.uri.path}',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final request = err.requestOptions;
    _logger.debug(
      '✗ ${err.response?.statusCode ?? err.type.name} '
      '${request.method} ${request.uri.path}',
    );
    handler.next(err);
  }
}
