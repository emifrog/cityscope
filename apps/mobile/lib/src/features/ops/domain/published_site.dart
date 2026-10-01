import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:flutter/foundation.dart';

/// Lecture du fichier de données d'une version publiée (`data/site.json`),
/// déjà vérifié par empreinte et signature à l'installation (ADR-016). Les
/// écrans OPS ne lisent que ce contenu : jamais de données de travail.
///
/// La lecture est tolérante : un champ inattendu ne doit pas empêcher
/// l'intervenant de consulter le reste de la fiche.

/// Objet JSON sous [key], ou null (absent ou d'un autre type).
JsonMap? _object(JsonMap json, String key) {
  final value = json[key];
  return value is Map<String, Object?> ? value : null;
}

/// Éléments d'une liste lus un par un : un élément illisible est ignoré
/// plutôt que de rendre tout le site inconsultable.
List<T> _each<T>(Object? list, T? Function(JsonMap item) read) => [
  if (list is List<Object?>)
    for (final item in list)
      if (item is Map<String, Object?>) ?_tryRead(() => read(item)),
];

T? _tryRead<T>(T? Function() read) {
  try {
    return read();
  } on FormatException {
    return null;
  } on TypeError {
    return null;
  }
}

/// Point ou tracé dans les pixels du fond de plan.
@immutable
final class PlanGeometry {
  const PlanGeometry(this.type, this.points);

  /// `Point`, `LineString` ou `Polygon` (anneau extérieur seulement).
  final String type;
  final List<(double, double)> points;

  static PlanGeometry? fromJson(JsonMap? json) {
    if (json == null) return null;
    final type = json.optionalString('type');
    final coordinates = json['coordinates'];
    List<(double, double)> positions(Object? list) => [
      if (list is List<Object?>)
        for (final position in list)
          if (position is List<Object?> &&
              position.length >= 2 &&
              position[0] is num &&
              position[1] is num)
            (
              (position[0]! as num).toDouble(),
              (position[1]! as num).toDouble(),
            ),
    ];
    return switch (type) {
      'Point' => PlanGeometry('Point', positions([coordinates])),
      'LineString' => PlanGeometry('LineString', positions(coordinates)),
      'Polygon' when coordinates is List<Object?> && coordinates.isNotEmpty =>
        PlanGeometry('Polygon', positions(coordinates.first)),
      _ => null,
    };
  }
}

/// Position validée sur un fond de plan précis.
@immutable
final class PlanPlacement {
  const PlanPlacement(this.planRevisionId, this.geometry);

  final String planRevisionId;
  final PlanGeometry geometry;

  static PlanPlacement? fromJson(JsonMap? json) {
    if (json == null) return null;
    final revision = json.optionalString('plan_revision_id');
    final geometry = PlanGeometry.fromJson(_object(json, 'geometry'));
    return revision == null || geometry == null
        ? null
        : PlanPlacement(revision, geometry);
  }
}

@immutable
final class SiteAddress {
  const SiteAddress({required this.label, required this.city, this.postalCode});

  final String label;
  final String city;
  final String? postalCode;
}

@immutable
final class Classification {
  const Classification({
    required this.type,
    this.code,
    this.category,
    this.label,
  });

  final String type;
  final String? code;
  final String? category;
  final String? label;

  /// « ERP J cat. 3 », « ICPE », « SEVESO seuil haut »…
  String get shortLabel => [
    type == 'OTHER' ? null : type,
    code,
    if (category != null) 'cat. $category',
  ].nonNulls.join(' ');
}

@immutable
final class Level {
  const Level({required this.id, required this.label, required this.sortOrder});

  final String id;
  final String label;
  final int sortOrder;
}

@immutable
final class Building {
  const Building({
    required this.id,
    required this.name,
    required this.levels,
    this.code,
  });

  final String id;
  final String name;
  final String? code;
  final List<Level> levels;
}

@immutable
final class SiteContact {
  const SiteContact({
    required this.name,
    required this.phone,
    this.role,
    this.phoneAlt,
    this.email,
    this.availability,
    this.verifiedAt,
  });

  final String name;
  final String? role;
  final String phone;
  final String? phoneAlt;
  final String? email;
  final String? availability;
  final DateTime? verifiedAt;
}

@immutable
final class SitePlan {
  const SitePlan({
    required this.id,
    required this.title,
    required this.planType,
    required this.revisionId,
    required this.width,
    required this.height,
    required this.assetSha256,
    required this.mimeType,
    this.buildingId,
    this.levelId,
  });

  final String id;
  final String title;
  final String planType;
  final String? buildingId;
  final String? levelId;

  /// Révision du fond validée : les positions s'y rapportent.
  final String revisionId;
  final double width;
  final double height;
  final String assetSha256;
  final String mimeType;
}

@immutable
final class SiteZone {
  const SiteZone({
    required this.id,
    required this.levelId,
    required this.name,
    required this.zoneType,
    this.placement,
  });

  final String id;
  final String levelId;
  final String name;
  final String zoneType;
  final PlanPlacement? placement;
}

/// Point opérationnel (accès, eau, coupure, moyen de secours…).
@immutable
final class SiteObject {
  const SiteObject({
    required this.id,
    required this.typeCode,
    required this.typeName,
    required this.category,
    required this.criticality,
    required this.status,
    required this.properties,
    this.name,
    this.label,
    this.buildingId,
    this.levelId,
    this.zoneId,
    this.instructions,
    this.verifiedAt,
    this.location,
    this.placement,
    this.photos = const [],
  });

  final String id;
  final String typeCode;
  final String typeName;
  final String category;
  final String? name;
  final String? label;
  final String? buildingId;
  final String? levelId;
  final String? zoneId;
  final Map<String, Object?> properties;
  final String? instructions;
  final String criticality;
  final String status;
  final DateTime? verifiedAt;

  /// Position GPS d'un point extérieur (longitude, latitude).
  final (double, double)? location;
  final PlanPlacement? placement;

  /// Photos contrôlées (PLAN-05), installées avec la version.
  final List<ObjectPhoto> photos;

  String get title => name ?? label ?? typeName;
  bool get outOfService => status == 'out_of_service';
}

/// Photo d'un point : le fichier, par empreinte, est dans la base chiffrée.
@immutable
final class ObjectPhoto {
  const ObjectPhoto({
    required this.id,
    required this.assetSha256,
    required this.mimeType,
    this.caption,
  });

  final String id;
  final String assetSha256;
  final String mimeType;
  final String? caption;
}

@immutable
final class SiteRisk {
  const SiteRisk({
    required this.id,
    required this.typeCode,
    required this.typeName,
    required this.iconKey,
    required this.severity,
    required this.properties,
    this.label,
    this.description,
    this.quantity,
    this.unit,
    this.buildingId,
    this.levelId,
    this.zoneId,
    this.placement,
  });

  final String id;
  final String typeCode;
  final String typeName;
  final String iconKey;

  /// 1 (faible) à 5 (majeure).
  final int severity;
  final String? label;
  final String? description;
  final double? quantity;
  final String? unit;
  final Map<String, Object?> properties;
  final String? buildingId;
  final String? levelId;
  final String? zoneId;
  final PlanPlacement? placement;

  String get title => label ?? typeName;

  /// Gravité 4 ou 5 : affiché en tête de la synthèse.
  bool get critical => severity >= 4;
}

@immutable
final class SiteDocument {
  const SiteDocument({
    required this.id,
    required this.title,
    required this.category,
    required this.offlinePolicy,
    required this.versionNo,
    required this.assetSha256,
    required this.mimeType,
    required this.filename,
    this.expiresAt,
  });

  final String id;
  final String title;
  final String category;
  final String offlinePolicy;
  final int versionNo;
  final String assetSha256;
  final String mimeType;
  final String filename;
  final DateTime? expiresAt;
}

/// Champ déclaré par le catalogue pour les propriétés d'un type.
@immutable
final class FieldDefinition {
  const FieldDefinition({
    required this.name,
    required this.type,
    this.title,
    this.unit,
    this.choices = const {},
  });

  final String name;
  final String type;
  final String? title;
  final String? unit;

  /// Libellés des valeurs autorisées.
  final Map<String, String> choices;

  /// Valeur lisible : « Oui », « 120 m³/h », libellé du choix…
  String format(Object? value) {
    if (value == null) return '—';
    if (value is bool) return value ? 'Oui' : 'Non';
    final choice = choices['$value'];
    if (choice != null) return choice;
    if (value is num) {
      final text = value == value.roundToDouble()
          ? value.toInt().toString()
          : value.toString().replaceAll('.', ',');
      return unit == null ? text : '$text $unit';
    }
    return unit == null ? '$value' : '$value $unit';
  }
}

/// Champs déclarés d'un type du catalogue, tels que publiés.
Map<String, FieldDefinition> fieldsOf(Object? schema) {
  if (schema is! Map<String, Object?>) return const {};
  final properties = schema['properties'];
  if (properties is! Map<String, Object?>) return const {};
  return {
    for (final MapEntry(:key, :value) in properties.entries)
      if (value is Map<String, Object?>)
        key: FieldDefinition(
          name: key,
          type: '${value['type']}',
          title: value['title'] as String?,
          unit: value['unit'] as String?,
          choices: {
            for (final choice
                in value['oneOf'] is List<Object?>
                    ? value['oneOf']! as List<Object?>
                    : const <Object?>[])
              if (choice is Map<String, Object?>)
                '${choice['const']}': '${choice['title'] ?? choice['const']}',
          },
        ),
  };
}

/// Version publiée d'un site, telle qu'installée sur la tablette.
@immutable
final class PublishedSite {
  const PublishedSite({
    required this.publicationId,
    required this.publicationNumber,
    required this.siteId,
    required this.name,
    required this.siteType,
    required this.classifications,
    required this.buildings,
    required this.contacts,
    required this.plans,
    required this.zones,
    required this.objects,
    required this.risks,
    required this.documents,
    required this.objectFields,
    required this.riskFields,
    this.revisionNo,
    this.approvedBy,
    this.approvedAt,
    this.publishedAt,
    this.shortName,
    this.etareNumber,
    this.address,
    this.location,
  });

  factory PublishedSite.fromJsonText(String text) =>
      PublishedSite.fromJson(asJsonMap(jsonDecode(text)));

  factory PublishedSite.fromJson(JsonMap payload) {
    final publication = payload.requireObject('publication');
    final data = payload.requireObject('data');
    final site = data.requireObject('site');
    final address = _object(site, 'address');
    final catalog = _object(data, 'catalog');

    DateTime? date(JsonMap json, String key) =>
        DateTime.tryParse(json.optionalString(key) ?? '')?.toUtc();
    Map<String, Object?> props(JsonMap json) =>
        json['properties'] is Map<String, Object?>
        ? json['properties']! as Map<String, Object?>
        : const {};

    final catalogLists = (
      objects: _each(catalog?['object_types'], (type) => type),
      risks: _each(catalog?['risk_types'], (type) => type),
    );

    return PublishedSite(
      publicationId: publication.requireString('id'),
      publicationNumber: publication.requireInt('publication_number'),
      revisionNo: publication.optionalInt('revision_no'),
      approvedBy: publication.optionalString('approved_by'),
      approvedAt: date(publication, 'approved_at'),
      publishedAt: date(publication, 'created_at'),
      siteId: site.requireString('id'),
      name: site.requireString('name'),
      shortName: site.optionalString('short_name'),
      etareNumber: site.optionalString('etare_number'),
      siteType: site.optionalString('site_type') ?? 'other',
      address: address == null
          ? null
          : SiteAddress(
              label: address.optionalString('label') ?? '',
              city: address.optionalString('city') ?? '',
              postalCode: address.optionalString('postal_code'),
            ),
      location: _point(_object(site, 'location')),
      classifications: _each(
        data['classifications'],
        (item) => Classification(
          type: item.optionalString('classification_type') ?? 'OTHER',
          code: item.optionalString('code'),
          category: item.optionalString('category'),
          label: item.optionalString('label'),
        ),
      ),
      buildings: _each(
        data['buildings'],
        (item) => Building(
          id: item.requireString('id'),
          name: item.optionalString('name') ?? 'Bâtiment',
          code: item.optionalString('code'),
          levels: _each(
            item['levels'],
            (level) => Level(
              id: level.requireString('id'),
              label: level.optionalString('label') ?? 'Niveau',
              sortOrder: level.optionalInt('sort_order') ?? 0,
            ),
          )..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
        ),
      ),
      contacts: _each(
        data['contacts'],
        (item) => SiteContact(
          name: item.optionalString('name') ?? 'Contact',
          role: item.optionalString('role'),
          phone: item.optionalString('phone') ?? '',
          phoneAlt: item.optionalString('phone_alt'),
          email: item.optionalString('email'),
          availability: item.optionalString('availability'),
          verifiedAt: date(item, 'verified_at'),
        ),
      ),
      plans: _each(data['plans'], (item) {
        final background = _object(item, 'background');
        final asset = background == null ? null : _object(background, 'asset');
        if (background == null || asset == null) return null;
        return SitePlan(
          id: item.requireString('id'),
          title: item.optionalString('title') ?? 'Plan',
          planType: item.optionalString('plan_type') ?? 'other',
          buildingId: item.optionalString('building_id'),
          levelId: item.optionalString('level_id'),
          revisionId: background.requireString('revision_id'),
          width: background.optionalNumber('width') ?? 1,
          height: background.optionalNumber('height') ?? 1,
          assetSha256: asset.requireString('sha256'),
          mimeType: asset.optionalString('mime_type') ?? 'image/png',
        );
      }),
      zones: _each(
        data['zones'],
        (item) => SiteZone(
          id: item.requireString('id'),
          levelId: item.optionalString('level_id') ?? '',
          name: item.optionalString('name') ?? 'Zone',
          zoneType: item.optionalString('zone_type') ?? 'other',
          placement: PlanPlacement.fromJson(_object(item, 'plan_position')),
        ),
      ),
      objects: _each(
        data['objects'],
        (item) => SiteObject(
          id: item.requireString('id'),
          typeCode: item.optionalString('type_code') ?? '',
          typeName: item.optionalString('type_name') ?? 'Point',
          category: item.optionalString('category') ?? 'annotation',
          name: item.optionalString('name'),
          label: item.optionalString('label'),
          buildingId: item.optionalString('building_id'),
          levelId: item.optionalString('level_id'),
          zoneId: item.optionalString('zone_id'),
          properties: props(item),
          instructions: item.optionalString('instructions'),
          criticality: item.optionalString('criticality') ?? 'info',
          status: item.optionalString('status') ?? 'active',
          verifiedAt: date(item, 'verified_at'),
          location: _point(_object(item, 'geometry')),
          placement: PlanPlacement.fromJson(_object(item, 'plan_position')),
          photos: _each(item['photos'], (photo) {
            final asset = _object(photo, 'asset');
            if (asset == null) return null;
            return ObjectPhoto(
              id: photo.requireString('id'),
              caption: photo.optionalString('caption'),
              assetSha256: asset.requireString('sha256'),
              mimeType: asset.optionalString('mime_type') ?? 'image/jpeg',
            );
          }),
        ),
      ),
      risks: _each(
        data['risks'],
        (item) => SiteRisk(
          id: item.requireString('id'),
          typeCode: item.optionalString('type_code') ?? '',
          typeName: item.optionalString('type_name') ?? 'Risque',
          iconKey: item.optionalString('icon_key') ?? 'risk-generic',
          severity: item.optionalInt('severity') ?? 3,
          label: item.optionalString('label'),
          description: item.optionalString('description'),
          quantity: item.optionalNumber('quantity'),
          unit: item.optionalString('unit'),
          properties: props(item),
          buildingId: item.optionalString('building_id'),
          levelId: item.optionalString('level_id'),
          zoneId: item.optionalString('zone_id'),
          placement: PlanPlacement.fromJson(_object(item, 'plan_position')),
        ),
      )..sort((a, b) => b.severity.compareTo(a.severity)),
      documents: _each(data['documents'], (item) {
        final version = _object(item, 'version');
        final asset = version == null ? null : _object(version, 'asset');
        if (version == null || asset == null) return null;
        return SiteDocument(
          id: item.requireString('id'),
          title: item.optionalString('title') ?? 'Document',
          category: item.optionalString('category') ?? 'other',
          offlinePolicy: item.optionalString('offline_policy') ?? 'never',
          versionNo: version.optionalInt('version_no') ?? 1,
          assetSha256: asset.requireString('sha256'),
          mimeType: asset.optionalString('mime_type') ?? '',
          filename: asset.optionalString('filename') ?? 'document',
          expiresAt: date(version, 'expires_at'),
        );
      }),
      objectFields: {
        for (final type in catalogLists.objects)
          type.optionalString('code') ?? '': fieldsOf(
            type['properties_schema'],
          ),
      },
      riskFields: {
        for (final type in catalogLists.risks)
          type.optionalString('code') ?? '': fieldsOf(
            type['properties_schema'],
          ),
      },
    );
  }

  static (double, double)? _point(JsonMap? geometry) {
    if (geometry?.optionalString('type') != 'Point') return null;
    final coordinates = geometry!['coordinates'];
    if (coordinates is! List<Object?> || coordinates.length < 2) return null;
    final lon = coordinates[0];
    final lat = coordinates[1];
    return lon is num && lat is num ? (lon.toDouble(), lat.toDouble()) : null;
  }

  final String publicationId;
  final int publicationNumber;
  final int? revisionNo;
  final String? approvedBy;
  final DateTime? approvedAt;
  final DateTime? publishedAt;
  final String siteId;
  final String name;
  final String? shortName;
  final String? etareNumber;
  final String siteType;
  final SiteAddress? address;
  final (double, double)? location;
  final List<Classification> classifications;
  final List<Building> buildings;
  final List<SiteContact> contacts;
  final List<SitePlan> plans;
  final List<SiteZone> zones;
  final List<SiteObject> objects;

  /// Triés par gravité décroissante.
  final List<SiteRisk> risks;
  final List<SiteDocument> documents;
  final Map<String, Map<String, FieldDefinition>> objectFields;
  final Map<String, Map<String, FieldDefinition>> riskFields;

  List<SiteObject> objectsOf(Set<String> categories) => [
    for (final object in objects)
      if (categories.contains(object.category)) object,
  ]..sort(_byCriticality);

  static int _byCriticality(SiteObject a, SiteObject b) =>
      _rank(b.criticality).compareTo(_rank(a.criticality));

  static int _rank(String criticality) => switch (criticality) {
    'critical' => 2,
    'important' => 1,
    _ => 0,
  };

  /// Dernière vérification connue d'un élément (affichage de l'âge, OPS-05).
  DateTime? get lastVerifiedAt =>
      [
        for (final object in objects) object.verifiedAt,
        for (final contact in contacts) contact.verifiedAt,
      ].nonNulls.fold<DateTime?>(
        null,
        (latest, date) =>
            latest == null || date.isAfter(latest) ? date : latest,
      );

  /// « Bâtiment A · RDC · Local pharmacie » à partir des rattachements.
  String? locationOf({String? buildingId, String? levelId, String? zoneId}) {
    final building = buildings.where((b) => b.id == buildingId).firstOrNull;
    final level = buildings
        .expand((b) => b.levels)
        .where((l) => l.id == levelId)
        .firstOrNull;
    final zone = zones.where((z) => z.id == zoneId).firstOrNull;
    final parts = [building?.name, level?.label, zone?.name].nonNulls;
    return parts.isEmpty ? null : parts.join(' · ');
  }

  /// Plans dans l'ordre du terrain : masse d'abord, puis bâtiments et niveaux.
  List<SitePlan> get orderedPlans {
    int levelOrder(SitePlan plan) =>
        buildings
            .expand((b) => b.levels)
            .where((l) => l.id == plan.levelId)
            .firstOrNull
            ?.sortOrder ??
        -1000;
    int buildingOrder(SitePlan plan) {
      final index = buildings.indexWhere((b) => b.id == plan.buildingId);
      return index < 0 ? -1 : index;
    }

    return [...plans]..sort((a, b) {
      final site = (a.planType == 'site' ? 0 : 1).compareTo(
        b.planType == 'site' ? 0 : 1,
      );
      if (site != 0) return site;
      final building = buildingOrder(a).compareTo(buildingOrder(b));
      if (building != 0) return building;
      return levelOrder(a).compareTo(levelOrder(b));
    });
  }
}
