import 'package:etare_ops/src/core/json/json_reader.dart';

/// DTO de `GET /sites` (page paginée par curseur opaque).
final class SitesPageDto {
  const SitesPageDto({required this.items, this.nextCursor});

  factory SitesPageDto.fromJson(JsonMap json) => SitesPageDto(
    items: [
      for (final item in json.requireObjectList('items'))
        SiteDto.fromJson(item),
    ],
    nextCursor: json.optionalString('next_cursor'),
  );

  final List<SiteDto> items;
  final String? nextCursor;
}

final class SiteDto {
  const SiteDto({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.status,
    required this.siteType,
    required this.sensitivity,
    required this.updatedAt,
    this.shortName,
    this.etareNumber,
    this.address,
    this.location,
  });

  factory SiteDto.fromJson(JsonMap json) {
    final address = json.optionalObject('address');
    final location = json.optionalObject('location');
    return SiteDto(
      id: json.requireString('id'),
      tenantId: json.requireString('tenant_id'),
      name: json.requireString('name'),
      shortName: json.optionalString('short_name'),
      status: json.requireString('status'),
      siteType: json.requireString('site_type'),
      sensitivity: json.requireString('sensitivity'),
      etareNumber: json.optionalString('etare_number'),
      address: address == null ? null : AddressDto.fromJson(address),
      location: location == null ? null : GeoPointDto.fromJson(location),
      updatedAt: json.requireDateTime('updated_at'),
    );
  }

  final String id;
  final String tenantId;
  final String name;
  final String? shortName;
  final String status;
  final String siteType;
  final String sensitivity;
  final String? etareNumber;
  final AddressDto? address;
  final GeoPointDto? location;
  final DateTime updatedAt;
}

final class AddressDto {
  const AddressDto({this.label, this.city, this.postalCode});

  factory AddressDto.fromJson(JsonMap json) => AddressDto(
    label: json.optionalString('label'),
    city: json.optionalString('city'),
    postalCode: json.optionalString('postal_code'),
  );

  final String? label;
  final String? city;
  final String? postalCode;
}

/// Point GeoJSON : `{"type":"Point","coordinates":[longitude, latitude]}`.
final class GeoPointDto {
  const GeoPointDto({required this.longitude, required this.latitude});

  factory GeoPointDto.fromJson(JsonMap json) {
    final type = json.requireString('type');
    final coordinates = json.requireNumberList('coordinates');
    if (type != 'Point' || coordinates.length < 2) {
      throw const FormatException('« location » : Point GeoJSON attendu');
    }
    return GeoPointDto(longitude: coordinates[0], latitude: coordinates[1]);
  }

  final double longitude;
  final double latitude;
}
