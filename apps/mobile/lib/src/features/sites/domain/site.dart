import 'package:flutter/foundation.dart';

/// Adresse postale d'un site (champs facultatifs).
@immutable
final class SiteAddress {
  const SiteAddress({this.label, this.city, this.postalCode});

  final String? label;
  final String? city;
  final String? postalCode;
}

/// Coordonnées WGS 84.
@immutable
final class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

/// Site / bâtiment faisant l'objet d'un plan ETARE.
///
/// Les champs d'énumération (`status`, `siteType`, `sensitivity`) restent des
/// chaînes tant que le contrat OpenAPI n'est pas figé.
@immutable
final class Site {
  const Site({
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

  final String id;
  final String tenantId;
  final String name;
  final String? shortName;
  final String status;
  final String siteType;
  final String sensitivity;
  final String? etareNumber;
  final SiteAddress? address;
  final GeoPoint? location;
  final DateTime updatedAt;
}
