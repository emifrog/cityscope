import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/network/api_error_mapper.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:etare_ops/src/features/auth/domain/auth_repository.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';

/// Adaptateur REST minimal pour Supabase Auth (GoTrue), sans dépendre de
/// `supabase_flutter`.
///
/// Le [Dio] fourni doit avoir pour `baseUrl` l'URL Auth (ex.
/// `http://10.0.2.2:54321/auth/v1`) et ne porter AUCUN intercepteur
/// d'authentification (pas de boucle de rafraîchissement).
final class GoTrueAuthRepository implements AuthRepository {
  GoTrueAuthRepository({
    required this._dio,
    required this._publishableKey,
    this._clock = DateTime.now,
  });

  final Dio _dio;
  final String _publishableKey;
  final DateTime Function() _clock;

  Options _options({String? bearer}) => Options(
    headers: {
      'apikey': _publishableKey,
      Headers.contentTypeHeader: Headers.jsonContentType,
      if (bearer != null) 'Authorization': 'Bearer $bearer',
    },
  );

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) => _tokenRequest(
    grantType: 'password',
    body: {'email': email, 'password': password},
  );

  @override
  Future<AuthSession> refreshSession(String refreshToken) => _tokenRequest(
    grantType: 'refresh_token',
    body: {'refresh_token': refreshToken},
  );

  @override
  Future<void> signOut(String accessToken) async {
    try {
      await _dio.post<Object?>(
        '/logout',
        options: _options(bearer: accessToken),
      );
    } on DioException catch (error) {
      throw _mapError(error, grantType: null);
    }
  }

  Future<AuthSession> _tokenRequest({
    required String grantType,
    required Map<String, String> body,
  }) async {
    final Response<Object?> response;
    try {
      response = await _dio.post<Object?>(
        '/token',
        queryParameters: {'grant_type': grantType},
        data: body,
        options: _options(),
      );
    } on DioException catch (error) {
      throw _mapError(error, grantType: grantType);
    }
    try {
      return _parseSession(response.data);
    } on FormatException catch (error) {
      throw AuthException(
        AuthFailure.unexpected,
        'Session GoTrue invalide : ${error.message}',
      );
    }
  }

  AuthSession _parseSession(Object? data) {
    final json = asJsonMap(data, 'session');
    final user = json.requireObject('user');
    final expiresAt = json.optionalInt('expires_at');
    final expiresIn = json.optionalInt('expires_in');
    return AuthSession(
      accessToken: json.requireString('access_token'),
      refreshToken: json.requireString('refresh_token'),
      expiresAt: expiresAt != null
          ? DateTime.fromMillisecondsSinceEpoch(expiresAt * 1000, isUtc: true)
          : _clock().toUtc().add(Duration(seconds: expiresIn ?? 3600)),
      user: AuthUser(
        id: user.requireString('id'),
        email: user.optionalString('email') ?? '',
      ),
    );
  }

  /// Traduit les réponses GoTrue (formats récents `error_code` et anciens
  /// `error`/`error_description`) et les erreurs réseau.
  AuthException _mapError(DioException error, {required String? grantType}) {
    final response = error.response;
    if (response == null) {
      final mapped = mapDioException(error);
      return AuthException(
        mapped is NetworkException
            ? AuthFailure.network
            : AuthFailure.unexpected,
        mapped.message,
      );
    }

    final status = response.statusCode ?? 0;
    final body = response.data;
    final json = body is Map<String, Object?>
        ? body
        : const <String, Object?>{};
    final code =
        _stringOrNull(json['error_code']) ?? _stringOrNull(json['error']);
    final detail =
        _stringOrNull(json['msg']) ??
        _stringOrNull(json['error_description']) ??
        _stringOrNull(json['message']) ??
        'HTTP $status';

    const expiredCodes = {
      'refresh_token_not_found',
      'refresh_token_already_used',
      'session_not_found',
      'session_expired',
      'invalid_grant',
    };
    const credentialCodes = {
      'invalid_credentials',
      'invalid_grant',
      'email_not_confirmed',
      'user_banned',
    };

    final failure = switch (status) {
      429 => AuthFailure.rateLimited,
      // Clé publishable refusée (passerelle) ou mauvaise URL d'auth.
      401 || 404 when grantType != 'refresh_token' => AuthFailure.configuration,
      400 || 401 || 403
          when grantType == 'refresh_token' &&
              (code == null || expiredCodes.contains(code)) =>
        AuthFailure.sessionExpired,
      400 || 422
          when grantType == 'password' &&
              (code == null || credentialCodes.contains(code)) =>
        AuthFailure.invalidCredentials,
      _ => AuthFailure.unexpected,
    };
    return AuthException(failure, 'GoTrue $status ${code ?? ''}: $detail');
  }

  static String? _stringOrNull(Object? value) => value is String ? value : null;
}
