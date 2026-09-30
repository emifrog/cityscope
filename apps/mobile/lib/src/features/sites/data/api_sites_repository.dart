import 'package:etare_ops/src/core/domain/cursor_page.dart';
import 'package:etare_ops/src/data/remote/dto/site_dto.dart';
import 'package:etare_ops/src/data/remote/etare_api_client.dart';
import 'package:etare_ops/src/features/sites/domain/site.dart';
import 'package:etare_ops/src/features/sites/domain/sites_repository.dart';

/// Implémentation adossée à `GET /sites` (mapping DTO → domaine).
final class ApiSitesRepository implements SitesRepository {
  ApiSitesRepository(this._client);

  final EtareApiClient _client;

  @override
  Future<CursorPage<Site>> listSites({
    required String tenantId,
    int limit = 25,
    String? cursor,
  }) async {
    final page = await _client.listSites(
      tenantId: tenantId,
      limit: limit,
      cursor: cursor,
    );
    return CursorPage(
      items: List.unmodifiable(page.items.map(_toDomain)),
      nextCursor: page.nextCursor,
    );
  }

  static Site _toDomain(SiteDto dto) => Site(
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    shortName: dto.shortName,
    status: dto.status,
    siteType: dto.siteType,
    sensitivity: dto.sensitivity,
    etareNumber: dto.etareNumber,
    address: switch (dto.address) {
      null => null,
      final a => SiteAddress(
        label: a.label,
        city: a.city,
        postalCode: a.postalCode,
      ),
    },
    location: switch (dto.location) {
      null => null,
      final l => GeoPoint(latitude: l.latitude, longitude: l.longitude),
    },
    updatedAt: dto.updatedAt,
  );
}
