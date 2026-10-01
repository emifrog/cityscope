import 'dart:convert';

import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';

/// PNG 1×1 : fond de plan minimal (le plan déclare ses dimensions).
/// PDF installé avec la version (dossier ETARE et document essentiel).
final tinyPdf = utf8.encode('%PDF-1.4\n% ETARE de démonstration\n%%EOF\n');
const documentVersionId = '0600000b-0000-4000-8000-0000000000d1';

/// Document « à la demande » (DOC-02) : listé, téléchargé seulement si l'agent
/// le demande ; un document « jamais » reste au back-office.
final onDemandPdf = utf8.encode('%PDF-1.4\n% Plan de prévention\n%%EOF\n');
const onDemandDocumentId = '0600000a-0000-4000-8000-0000000000d2';
const onDemandVersionId = '0600000b-0000-4000-8000-0000000000d2';

final tinyPng = base64.decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

const siteId = '06000002-0000-4000-8000-000000000001';
const publicationId = '0600000f-0000-4000-8000-000000000002';
const planId = '06000006-0000-4000-8000-000000000001';
const planRevision = '06000007-0000-4000-8000-000000000001';
const levelId = '06000004-0000-4000-8000-000000000002';
const oxygenId = '06000009-0000-4000-8000-000000000002';
const oxygenRiskId = '0600000b-0000-4000-8000-000000000001';
const photoId = '0600000e-0000-4000-8000-000000000001';

Map<String, Object?> point(double x, double y) => {
  'plan_revision_id': planRevision,
  'geometry': {
    'type': 'Point',
    'coordinates': [x, y],
  },
};

/// Fichier de données d'une version publiée, comme le fabrique le worker
/// (instantané du dossier EHPAD Les Oliviers du seed, simplifié).
final payload = {
  'schema_version': 1,
  'publication': {
    'id': publicationId,
    'publication_number': 2,
    'site_id': siteId,
    'revision_no': 2,
    'approved_by': 'Validateur Prévision 06 (démo)',
    'approved_at': '2026-09-30T11:00:00.000Z',
    'created_at': '2026-09-30T12:00:00.000Z',
  },
  'data': {
    'schema_version': 1,
    'site': {
      'id': siteId,
      'etare_number': '06-0428',
      'name': 'EHPAD Les Oliviers',
      'short_name': 'Les Oliviers',
      'site_type': 'health',
      'status': 'active',
      'sensitivity': 'normal',
      'address': {
        'label': '12 avenue des Mimosas',
        'city': 'Nice',
        'postal_code': '06000',
      },
      'location': {
        'type': 'Point',
        'coordinates': [7.2514, 43.7076],
      },
      'footprint': null,
    },
    'classifications': [
      {
        'classification_type': 'ERP',
        'code': 'J',
        'category': '3',
        'label': 'Établissement médico-social',
      },
    ],
    'buildings': [
      {
        'id': '06000003-0000-4000-8000-000000000001',
        'name': 'Bâtiment A',
        'code': 'A',
        'levels': [
          {'id': levelId, 'label': 'RDC', 'sort_order': 0},
        ],
      },
    ],
    'contacts': [
      {
        'id': 'c1',
        'name': 'PC sécurité (démo)',
        'role': 'Accueil de nuit',
        'phone': '01 99 00 12 34',
        'availability': '24/7',
        'verified_at': '2026-09-18T09:00:00.000Z',
      },
    ],
    'plans': [
      {
        'id': planId,
        'title': 'Bâtiment A - RDC',
        'plan_type': 'level',
        'building_id': '06000003-0000-4000-8000-000000000001',
        'level_id': levelId,
        'background': {
          'revision_id': planRevision,
          'revision_no': 1,
          'page_number': 1,
          'width': 1600,
          'height': 1000,
          'asset': {
            'id': '06000005-0000-4000-8000-000000000001',
            'filename': 'rdc.png',
            'mime_type': 'image/png',
            'size_bytes': tinyPng.length,
            'sha256': sha256Hex(tinyPng),
          },
        },
      },
    ],
    'zones': [
      {
        'id': '06000008-0000-4000-8000-000000000002',
        'level_id': levelId,
        'name': 'Local pharmacie façade C',
        'zone_type': 'storage',
        'plan_position': {
          'plan_revision_id': planRevision,
          'geometry': {
            'type': 'Polygon',
            'coordinates': [
              [
                [480, 250],
                [560, 250],
                [560, 330],
                [480, 330],
                [480, 250],
              ],
            ],
          },
        },
      },
    ],
    'objects': [
      {
        'id': '06000009-0000-4000-8000-000000000001',
        'type_code': 'TGBT',
        'type_name': 'TGBT',
        'category': 'energy',
        'name': 'TGBT principal',
        'label': 'TGBT',
        'building_id': '06000003-0000-4000-8000-000000000001',
        'level_id': levelId,
        'zone_id': null,
        'geometry': null,
        'plan_position': point(412, 288),
        'properties': <String, Object?>{},
        'instructions': 'Coupure générale du bâtiment A.',
        'criticality': 'critical',
        'status': 'active',
        'verified_at': '2026-09-18T09:00:00.000Z',
        'photos': [
          {
            'id': photoId,
            'caption': 'Armoire TGBT',
            'asset': {
              'id': '06000005-0000-4000-8000-0000000000e1',
              'filename': 'tgbt.png',
              'mime_type': 'image/png',
              'size_bytes': tinyPng.length,
              'sha256': sha256Hex(tinyPng),
            },
          },
          // Illisible (sans fichier) : ignorée, le reste de la fiche reste lisible.
          {'id': 'photo-sans-fichier', 'caption': 'Perdue'},
        ],
      },
      {
        'id': oxygenId,
        'type_code': 'STOCKAGE_O2',
        'type_name': 'Stockage O₂',
        'category': 'risk',
        'name': 'Stockage O₂ médical',
        'label': 'O₂',
        'building_id': '06000003-0000-4000-8000-000000000001',
        'level_id': levelId,
        'zone_id': '06000008-0000-4000-8000-000000000002',
        'geometry': null,
        'plan_position': point(520, 290),
        'properties': {'quantite': 18, 'unite': 'bouteilles'},
        'instructions': 'Ventiler le local si fuite suspectée.',
        'criticality': 'critical',
        'status': 'active',
        'verified_at': '2026-09-18T09:00:00.000Z',
      },
      {
        'id': '06000009-0000-4000-8000-000000000004',
        'type_code': 'PEI',
        'type_name': 'Point d’eau incendie',
        'category': 'water',
        'name': 'PEI principal',
        'label': 'PEI 1',
        'building_id': null,
        'level_id': null,
        'zone_id': null,
        'geometry': {
          'type': 'Point',
          'coordinates': [7.2509, 43.7074],
        },
        'plan_position': null,
        'properties': {'debit_m3h': 120, 'nature': 'poteau'},
        'instructions': null,
        'criticality': 'important',
        'status': 'out_of_service',
        'verified_at': null,
      },
    ],
    'risks': [
      {
        'id': oxygenRiskId,
        'type_code': 'OXYGENE',
        'type_name': 'Oxygène',
        'icon_key': 'risk-oxygen',
        'severity': 4,
        'label': 'Oxygène médical',
        'description': 'Local RDC façade C',
        'quantity': 18,
        'unit': 'bouteilles',
        'properties': <String, Object?>{},
        'building_id': '06000003-0000-4000-8000-000000000001',
        'level_id': levelId,
        'zone_id': '06000008-0000-4000-8000-000000000002',
        'plan_position': point(530, 300),
      },
      {
        'id': '0600000b-0000-4000-8000-000000000003',
        'type_code': 'PHOTOVOLTAIQUE',
        'type_name': 'Photovoltaïque',
        'icon_key': 'risk-photovoltaic',
        'severity': 3,
        'label': null,
        'description': 'Toiture du bâtiment B',
        'quantity': null,
        'unit': null,
        'properties': <String, Object?>{},
        'building_id': null,
        'level_id': null,
        'zone_id': null,
        'plan_position': null,
      },
    ],
    'documents': [
      {
        'id': '0600000a-0000-4000-8000-0000000000d1',
        'title': 'Consignes de sécurité',
        'category': 'instruction',
        'offline_policy': 'always',
        'version': {
          'id': documentVersionId,
          'version_no': 1,
          'valid_from': null,
          'expires_at': null,
          'asset': {
            'id': '06000005-0000-4000-8000-0000000000d1',
            'filename': 'consignes.pdf',
            'mime_type': 'application/pdf',
            'size_bytes': tinyPdf.length,
            'sha256': sha256Hex(tinyPdf),
          },
        },
      },
      {
        'id': onDemandDocumentId,
        'title': 'Plan de prévention',
        'category': 'instruction',
        'offline_policy': 'on_demand',
        'version': {
          'id': onDemandVersionId,
          'version_no': 3,
          'valid_from': null,
          'expires_at': null,
          'asset': {
            'id': '06000005-0000-4000-8000-0000000000d2',
            'filename': 'prevention.pdf',
            'mime_type': 'application/pdf',
            'size_bytes': onDemandPdf.length,
            'sha256': sha256Hex(onDemandPdf),
          },
        },
      },
      {
        'id': '0600000a-0000-4000-8000-0000000000d3',
        'title': 'Contrat de maintenance',
        'category': 'other',
        'offline_policy': 'never',
        'version': {
          'id': '0600000b-0000-4000-8000-0000000000d3',
          'version_no': 1,
          'valid_from': null,
          'expires_at': null,
          'asset': {
            'id': '06000005-0000-4000-8000-0000000000d3',
            'filename': 'contrat.pdf',
            'mime_type': 'application/pdf',
            'size_bytes': 10,
            'sha256': 'c' * 64,
          },
        },
      },
    ],
    'catalog': {
      'object_types': [
        {
          'code': 'PEI',
          'name': 'Point d’eau incendie',
          'category': 'water',
          'icon_key': 'pei',
          'properties_schema': {
            'type': 'object',
            'properties': {
              'debit_m3h': {'type': 'number', 'title': 'Débit', 'unit': 'm³/h'},
              'nature': {
                'type': 'string',
                'title': 'Nature',
                'oneOf': [
                  {'const': 'poteau', 'title': 'Poteau incendie'},
                  {'const': 'bouche', 'title': 'Bouche incendie'},
                ],
              },
            },
          },
        },
      ],
      'risk_types': <Object?>[],
    },
  },
};

/// Version vérifiée prête à être activée dans la base de test.
InstallRecord installRecord() {
  final dataText = jsonEncode(payload);
  return InstallRecord(
    siteId: siteId,
    publicationId: publicationId,
    publicationNumber: 2,
    manifestHash: 'a' * 64,
    manifestText: '{}',
    signatureKeyId: 'pub-test',
    signature: 'sig',
    etareNumber: '06-0428',
    siteName: 'EHPAD Les Oliviers',
    publishedAt: DateTime.utc(2026, 9, 30, 12),
    files: [
      FileRecord(
        path: 'plans/$planRevision.png',
        sha256: sha256Hex(tinyPng),
        sizeBytes: tinyPng.length,
        mediaType: 'image/png',
        required: true,
      ),
      FileRecord(
        path: 'etare.pdf',
        sha256: sha256Hex(tinyPdf),
        sizeBytes: tinyPdf.length,
        mediaType: 'application/pdf',
        required: true,
      ),
      FileRecord(
        path: 'documents/$documentVersionId.pdf',
        sha256: sha256Hex(tinyPdf),
        sizeBytes: tinyPdf.length,
        mediaType: 'application/pdf',
        required: true,
      ),
      FileRecord(
        path: 'documents/$onDemandVersionId.pdf',
        sha256: sha256Hex(onDemandPdf),
        sizeBytes: onDemandPdf.length,
        mediaType: 'application/pdf',
        required: false,
      ),
      FileRecord(
        path: 'photos/$photoId.png',
        sha256: sha256Hex(tinyPng),
        sizeBytes: tinyPng.length,
        mediaType: 'image/png',
        required: true,
      ),
    ],
    dataFile: 'data/site.json',
    dataText: dataText,
    search: const SearchRecord(
      name: 'EHPAD Les Oliviers',
      etareNumber: '06-0428',
      addressLabel: '12 avenue des Mimosas',
      city: 'Nice',
      searchText: 'ehpad les oliviers 06 0428 12 avenue des mimosas nice 06000',
    ),
  );
}
