import 'package:dio/dio.dart';

/// Renvoie le jeton d'accès courant (éventuellement rafraîchi de façon
/// proactive), ou `null` si aucune session n'est ouverte.
typedef AccessTokenReader = Future<String?> Function();

/// Force un rafraîchissement de session. Renvoie le nouveau jeton, ou `null`
/// si la session ne peut plus être prolongée (l'utilisateur est alors
/// déconnecté par l'appelant). Lève une exception en cas d'échec transitoire
/// (réseau).
typedef AccessTokenRefresher = Future<String?> Function();

/// Renvoie l'identifiant du SIS (tenant) actif, ou `null`.
typedef TenantIdReader = String? Function();

/// Intercepteur de l'API produit :
/// - ajoute `Authorization: Bearer <access_token>` ;
/// - ajoute `X-Tenant-Id` quand un SIS est sélectionné (sauf si la requête
///   le fixe déjà explicitement) ;
/// - sur une réponse 401, rafraîchit la session UNE fois puis rejoue la
///   requête ; un second 401 est propagé tel quel.
final class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this._readAccessToken,
    required this._refreshAccessToken,
    required this._readTenantId,
    required this._retryClient,
  });

  static const tenantHeader = 'X-Tenant-Id';
  static const _authorizationHeader = 'Authorization';
  static const _retriedFlag = 'etare.auth.retried';

  final AccessTokenReader _readAccessToken;
  final AccessTokenRefresher _refreshAccessToken;
  final TenantIdReader _readTenantId;
  final Dio _retryClient;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      final token = await _readAccessToken();
      if (token != null) {
        options.headers[_authorizationHeader] = 'Bearer $token';
      }
      final tenantId = _readTenantId();
      if (tenantId != null && !options.headers.containsKey(tenantHeader)) {
        options.headers[tenantHeader] = tenantId;
      }
      handler.next(options);
    } on Object catch (error, stackTrace) {
      handler.reject(
        DioException(
          requestOptions: options,
          error: error,
          stackTrace: stackTrace,
        ),
      );
    }
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    final alreadyRetried = request.extra[_retriedFlag] == true;
    if (err.response?.statusCode != 401 || alreadyRetried) {
      handler.next(err);
      return;
    }

    final String? freshToken;
    try {
      // Une autre requête a peut-être déjà rafraîchi la session entre-temps.
      final current = await _readAccessToken();
      final sent = request.headers[_authorizationHeader];
      freshToken = current != null && sent != 'Bearer $current'
          ? current
          : await _refreshAccessToken();
    } on Object {
      handler.next(err);
      return;
    }
    if (freshToken == null) {
      handler.next(err);
      return;
    }

    try {
      final retried = request.copyWith(
        headers: {
          ...request.headers,
          _authorizationHeader: 'Bearer $freshToken',
        },
        extra: {...request.extra, _retriedFlag: true},
      );
      handler.resolve(await _retryClient.fetch<Object?>(retried));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
