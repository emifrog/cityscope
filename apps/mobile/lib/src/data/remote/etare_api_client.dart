import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/network/api_error_mapper.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:etare_ops/src/data/remote/dto/me_dto.dart';
import 'package:etare_ops/src/data/remote/dto/site_dto.dart';

/// Client REST écrit à la main pour l'API produit (JSON, snake_case).
///
/// Provisoire : il sera remplacé par un client Dart généré depuis la
/// spécification OpenAPI. Les fonctionnalités n'y accèdent qu'au travers de
/// leurs repositories, ce qui limite le remplacement à cette couche.
///
/// Lève [ApiException], [NetworkException] ou [UnexpectedResponseException].
final class EtareApiClient {
  EtareApiClient(this._dio);

  /// Taille de page maximale acceptée côté client.
  static const maxPageSize = 100;

  final Dio _dio;

  /// `GET /me` : utilisateur courant et ses rattachements (SIS + rôles).
  Future<MeResponseDto> getMe() => _get('/me', parse: MeResponseDto.fromJson);

  /// `GET /sites` pour le SIS [tenantId] (en-tête `X-Tenant-Id` explicite).
  Future<SitesPageDto> listSites({
    required String tenantId,
    int limit = 25,
    String? cursor,
  }) {
    if (limit < 1 || limit > maxPageSize) {
      throw ArgumentError.value(limit, 'limit', '1..$maxPageSize attendu');
    }
    return _get(
      '/sites',
      query: {'limit': limit, 'cursor': ?cursor},
      headers: {AuthInterceptor.tenantHeader: tenantId},
      parse: SitesPageDto.fromJson,
    );
  }

  Future<T> _get<T>(
    String path, {
    required T Function(JsonMap json) parse,
    Map<String, Object?>? query,
    Map<String, String>? headers,
  }) async {
    final Response<Object?> response;
    try {
      response = await _dio.get<Object?>(
        path,
        queryParameters: query,
        options: Options(headers: headers),
      );
    } on DioException catch (error) {
      throw mapDioException(error);
    }
    try {
      return parse(asJsonMap(response.data, path));
    } on FormatException catch (error) {
      throw UnexpectedResponseException('$path : ${error.message}');
    }
  }
}
