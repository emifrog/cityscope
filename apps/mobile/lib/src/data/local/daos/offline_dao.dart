import 'dart:typed_data';

import 'package:drift/drift.dart';
import 'package:etare_ops/src/core/time/trusted_clock.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/removal_notice.dart';
import 'package:flutter/foundation.dart';

part 'offline_dao.g.dart';

/// Site installé et sa position (carte locale, CAR-02).
@immutable
final class SiteLocation {
  const SiteLocation({
    required this.siteId,
    required this.name,
    required this.etareNumber,
    required this.addressLabel,
    required this.lon,
    required this.lat,
  });

  final String siteId;
  final String name;
  final String? etareNumber;
  final String? addressLabel;
  final double lon;
  final double lat;
}

/// Fichier d'une version à installer.
@immutable
final class FileRecord {
  const FileRecord({
    required this.path,
    required this.sha256,
    required this.sizeBytes,
    required this.mediaType,
    required this.required,
  });

  final String path;
  final String sha256;
  final int sizeBytes;
  final String mediaType;
  final bool required;
}

/// Entrée de l'index de recherche locale d'un site.
@immutable
final class SearchRecord {
  const SearchRecord({
    required this.name,
    required this.searchText,
    this.etareNumber,
    this.addressLabel,
    this.city,
  });

  final String name;
  final String? etareNumber;
  final String? addressLabel;
  final String? city;
  final String searchText;
}

/// Version vérifiée, prête à être activée.
@immutable
final class InstallRecord {
  const InstallRecord({
    required this.siteId,
    required this.publicationId,
    required this.publicationNumber,
    required this.manifestHash,
    required this.manifestText,
    required this.signatureKeyId,
    required this.signature,
    required this.siteName,
    required this.publishedAt,
    required this.files,
    required this.dataFile,
    required this.dataText,
    required this.search,
    this.etareNumber,
  });

  final String siteId;
  final String publicationId;
  final int publicationNumber;
  final String manifestHash;
  final String manifestText;
  final String signatureKeyId;
  final String signature;
  final String? etareNumber;
  final String siteName;
  final DateTime publishedAt;
  final List<FileRecord> files;

  /// Chemin du fichier de données, conservé en texte (`site_data`).
  final String dataFile;
  final String dataText;
  final SearchRecord search;
}

/// Résultat d'une synchronisation à enregistrer avec l'activation.
@immutable
final class ActivationRecord {
  const ActivationRecord({
    required this.install,
    required this.removeSites,
    required this.generation,
    required this.serverTime,
    required this.authorizedUserId,
    required this.authorizationExpiresAt,
    required this.complete,
    required this.now,
    this.error,
    this.keepBlobs = const {},
    this.requiredAppVersion,
    this.notices = const [],
    this.onDemand,
    this.timeAnchor,
    this.terminalPolicy,
  });

  final List<InstallRecord> install;
  final List<String> removeSites;
  final int generation;
  final DateTime serverTime;
  final String authorizedUserId;
  final DateTime authorizationExpiresAt;

  /// Toutes les versions du catalogue sont installées.
  final bool complete;
  final DateTime now;

  /// Message destiné à l'utilisateur quand l'installation est partielle.
  final String? error;

  /// Fichiers déjà téléchargés à conserver pour reprendre une installation
  /// interrompue (sinon effacés s'ils ne sont plus référencés).
  final Set<String> keepBlobs;

  /// Application trop ancienne pour une partie du contenu (SYN-02) : version
  /// exigée, ou chaîne vide si elle est inconnue ; null efface l'alerte.
  final String? requiredAppVersion;

  /// Raisons des retraits de ce jeu (MET-04), conservées pour l'agent.
  final List<RemovalNotice> notices;

  /// Sites restreints proposés à la demande par le catalogue (PER-02) ; null
  /// laisse la liste inchangée.
  final List<CatalogEntry>? onDemand;

  /// Heure du serveur au catalogue et horloge monotone à cet instant (SEC-05) ;
  /// null : horloge monotone indisponible, repère inchangé.
  final TimeAnchor? timeAnchor;

  /// Politique des tablettes reçue (JSON) ; null : aucune (valeurs par défaut).
  final String? terminalPolicy;
}

/// Clé `local_meta` des avis de retrait conservés (MET-04).
const removalNoticesKey = 'removal_notices';

/// Contenu hors ligne : versions installées, fichiers, données, index de
/// recherche. L'activation d'un nouveau jeu se fait dans UNE transaction :
/// après une coupure, la base contient l'ancien jeu ou le nouveau, jamais un
/// mélange (architecture §11).
@DriftAccessor(
  tables: [
    InstalledPublications,
    PublicationFiles,
    FileBlobs,
    SiteData,
    SiteSearch,
    SyncState,
    TrustedTime,
    FileChunks,
  ],
)
class OfflineDao extends DatabaseAccessor<AppDatabase> with _$OfflineDaoMixin {
  OfflineDao(super.attachedDatabase);

  Future<List<InstalledPublicationRow>> installed() =>
      select(installedPublications).get();

  /// Nouveau repère de temps de confiance (SEC-05) : l'heure du serveur
  /// remplace aussi la plus haute heure constatée, qu'une horloge avancée
  /// aurait poussée.
  Future<void> writeTimeAnchor(TimeAnchor? anchor) async {
    if (anchor == null) return;
    await (update(
      trustedTime,
    )..where((t) => t.id.equals(TrustedTime.singletonId))).write(
      TrustedTimeCompanion(
        anchorServerTime: Value(anchor.serverTime.toUtc()),
        anchorElapsedMs: Value(anchor.elapsedMs),
        anchorBootCount: Value(anchor.bootCount),
        highWater: Value(anchor.serverTime.toUtc()),
      ),
    );
  }

  Stream<int> watchInstalledCount() {
    final count = installedPublications.siteId.count();
    return (selectOnly(
      installedPublications,
    )..addColumns([count])).map((row) => row.read(count) ?? 0).watchSingle();
  }

  /// Empreintes déjà présentes localement parmi [hashes] : fichiers complets
  /// et vérifiés seulement, jamais un téléchargement en cours.
  Future<Set<String>> presentBlobs(Iterable<String> hashes) async {
    final wanted = hashes.toSet().toList();
    final present = <String>{};
    for (var start = 0; start < wanted.length; start += 500) {
      final chunk = wanted.sublist(
        start,
        start + 500 > wanted.length ? wanted.length : start + 500,
      );
      final rows =
          await (selectOnly(fileBlobs)
                ..addColumns([fileBlobs.sha256])
                ..where(
                  fileBlobs.sha256.isIn(chunk) &
                      fileBlobs.receivedBytes.isNull(),
                ))
              .map((row) => row.read(fileBlobs.sha256))
              .get();
      present.addAll(rows.nonNulls);
    }
    return present;
  }

  /// Dépose un fichier vérifié (zone de préparation : il n'est visible des
  /// écrans qu'une fois référencé par une version activée).
  Future<void> storeBlob(String sha256, Uint8List content, DateTime now) =>
      into(fileBlobs).insert(
        FileBlobsCompanion.insert(
          sha256: sha256,
          sizeBytes: content.length,
          content: content,
          storedAt: now,
        ),
        mode: InsertMode.insertOrIgnore,
      );

  /// Contenu entier d'un fichier complet (images) ; un PDF se lit plutôt
  /// morceau par morceau ([chunk]).
  Future<Uint8List?> blob(String sha256) async {
    final row = await _completeFile(sha256);
    if (row == null) return null;
    if (row.chunkCount == 0) return row.content;
    final builder = BytesBuilder(copy: false);
    for (var index = 0; index < row.chunkCount; index++) {
      builder.add(await _chunk(sha256, index));
    }
    return builder.takeBytes();
  }

  Future<FileBlobRow?> _completeFile(String sha256) =>
      (select(fileBlobs)
            ..where((t) => t.sha256.equals(sha256) & t.receivedBytes.isNull()))
          .getSingleOrNull();

  Future<Uint8List> _chunk(String sha256, int index) async {
    final row =
        await (select(fileChunks)
              ..where((t) => t.sha256.equals(sha256) & t.idx.equals(index)))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Morceau $index du fichier $sha256 absent.');
    }
    return row.content;
  }

  /// Taille et nombre de morceaux d'un fichier complet (0 : contenu entier,
  /// rangé avant CAP-02) ; null s'il n'est pas sur la tablette.
  Future<({int sizeBytes, int chunkCount})?> storedFile(String sha256) async {
    final row = await _completeFile(sha256);
    return row == null
        ? null
        : (sizeBytes: row.sizeBytes, chunkCount: row.chunkCount);
  }

  /// Morceau [index] d'un fichier rangé par morceaux (lecture d'un PDF page
  /// par page, CAP-02).
  Future<Uint8List> chunk(String sha256, int index) => _chunk(sha256, index);

  /// Octets déjà reçus d'un téléchargement en cours (0 : rien, ou le
  /// fichier est complet ; voir [presentBlobs]).
  Future<int> receivedBytes(String sha256) async {
    final row = await (select(
      fileBlobs,
    )..where((t) => t.sha256.equals(sha256))).getSingleOrNull();
    return row?.receivedBytes ?? 0;
  }

  /// Contenu reçu jusqu'ici, morceau par morceau (reprise : l'empreinte est
  /// recalculée sur ce qui est déjà rangé).
  Stream<Uint8List> receivedChunks(String sha256) async* {
    final row = await (select(
      fileBlobs,
    )..where((t) => t.sha256.equals(sha256))).getSingleOrNull();
    final count = row?.chunkCount ?? 0;
    for (var index = 0; index < count; index++) {
      yield await _chunk(sha256, index);
    }
  }

  /// Ajoute un morceau à un téléchargement en cours (créé au premier).
  Future<void> appendChunk(
    String sha256, {
    required int sizeBytes,
    required int index,
    required Uint8List content,
    required int receivedBytes,
    required DateTime now,
  }) => transaction(() async {
    await into(fileBlobs).insert(
      FileBlobsCompanion.insert(
        sha256: sha256,
        sizeBytes: sizeBytes,
        content: Uint8List(0),
        storedAt: now,
        chunkCount: Value(index + 1),
        receivedBytes: Value(receivedBytes),
      ),
      onConflict: DoUpdate(
        (_) => FileBlobsCompanion(
          chunkCount: Value(index + 1),
          receivedBytes: Value(receivedBytes),
        ),
      ),
    );
    await into(fileChunks).insertOnConflictUpdate(
      FileChunksCompanion.insert(sha256: sha256, idx: index, content: content),
    );
  });

  /// Le fichier reçu a la taille et l'empreinte annoncées : utilisable.
  Future<void> completeFile(String sha256) async {
    await (update(fileBlobs)..where((t) => t.sha256.equals(sha256))).write(
      const FileBlobsCompanion(receivedBytes: Value(null)),
    );
  }

  /// Pages libres de la base chiffrée (fichiers effacés) : place réutilisée
  /// par les prochains morceaux, que le système ne voit pas libre (CAP-02).
  Future<int> reusableBytes() async {
    // Valeur lue sans se fier au nom de colonne : la base chiffrée de la
    // tablette ne le rend pas comme SQLite seul. Sans valeur, rien compté.
    Future<int> pragma(String name) async {
      final row = await customSelect('PRAGMA $name').getSingleOrNull();
      final value = row?.data.values.firstOrNull;
      return value is int ? value : 0;
    }

    return await pragma('freelist_count') * await pragma('page_size');
  }

  /// Téléchargement abandonné ou fichier refusé : rien n'en reste.
  Future<void> discardFile(String sha256) => transaction(() async {
    await (delete(fileChunks)..where((t) => t.sha256.equals(sha256))).go();
    await (delete(fileBlobs)..where((t) => t.sha256.equals(sha256))).go();
  });

  /// Fichier de données de la version installée d'un site.
  Future<String?> dataText(String siteId) =>
      (select(siteData)..where((t) => t.siteId.equals(siteId)))
          .map((row) => row.dataText)
          .getSingleOrNull();

  Future<InstalledPublicationRow?> installedSite(String siteId) => (select(
    installedPublications,
  )..where((t) => t.siteId.equals(siteId))).getSingleOrNull();

  Future<List<PublicationFileRow>> files(String publicationId) => (select(
    publicationFiles,
  )..where((t) => t.publicationId.equals(publicationId))).get();

  /// Fichier [sha256] de la version installée d'un site, tel que son
  /// manifeste signé le décrit (taille, type, obligatoire ou non).
  Future<PublicationFileRow?> installedFile(
    String siteId,
    String sha256,
  ) async {
    final site = await installedSite(siteId);
    if (site == null) return null;
    return (select(publicationFiles)
          ..where(
            (t) =>
                t.publicationId.equals(site.publicationId) &
                t.sha256.equals(sha256),
          )
          ..limit(1))
        .getSingleOrNull();
  }

  /// Présence locale d'un fichier, suivie en continu (documents à la demande).
  Stream<bool> watchBlobPresent(String sha256) =>
      (selectOnly(fileBlobs)
            ..addColumns([fileBlobs.sha256])
            ..where(
              fileBlobs.sha256.equals(sha256) &
                  fileBlobs.receivedBytes.isNull(),
            ))
          .watch()
          .map((rows) => rows.isNotEmpty);

  /// Range un document « à la demande » vérifié (DOC-02), seulement si une
  /// version installée le référence encore : une synchronisation a pu la
  /// remplacer pendant le téléchargement. Renvoie `false` sinon.
  Future<bool> storeOnDemandBlob(
    String sha256,
    Uint8List content,
    DateTime now,
  ) => transaction(() async {
    final referenced = await (select(
      publicationFiles,
    )..where((t) => t.sha256.equals(sha256))).get();
    if (referenced.isEmpty) return false;
    await storeBlob(sha256, content, now);
    return true;
  });

  /// Rend utilisable un document « à la demande » téléchargé par morceaux,
  /// seulement si une version installée le référence encore ; sinon il est
  /// effacé. Renvoie `false` dans ce cas.
  Future<bool> completeOnDemandFile(String sha256) => transaction(() async {
    final referenced = await (select(
      publicationFiles,
    )..where((t) => t.sha256.equals(sha256))).get();
    if (referenced.isEmpty) {
      await discardFile(sha256);
      return false;
    }
    await completeFile(sha256);
    return true;
  });

  /// Retire un document « à la demande » de la tablette ; un fichier
  /// obligatoire d'une version installée n'est jamais retiré.
  Future<bool> discardOnDemandBlob(String sha256) => transaction(() async {
    final required = await (select(
      publicationFiles,
    )..where((t) => t.sha256.equals(sha256) & t.required.equals(true))).get();
    if (required.isNotEmpty) return false;
    await (delete(fileChunks)..where((t) => t.sha256.equals(sha256))).go();
    final deleted = await (delete(
      fileBlobs,
    )..where((t) => t.sha256.equals(sha256))).go();
    return deleted > 0;
  });

  /// Active le nouveau jeu en une transaction. Une version n'est activée que
  /// si tous ses fichiers obligatoires sont présents : sinon rien n'est écrit.
  Future<void> activate(ActivationRecord activation) => transaction(() async {
    for (final record in activation.install) {
      final required = [
        for (final file in record.files)
          if (file.required && file.path != record.dataFile) file.sha256,
      ];
      final present = await presentBlobs(required);
      if (present.length != required.toSet().length) {
        throw StateError(
          'Fichiers manquants pour la version ${record.publicationId}.',
        );
      }
    }

    for (final siteId in activation.removeSites) {
      await _removeSite(siteId);
    }
    if (activation.onDemand case final onDemand?) {
      await attachedDatabase.sensitiveDao.replaceOnDemand(onDemand);
    }
    // Raisons des retraits, dans la même transaction : un site réinstallé
    // n'a plus d'avis.
    final meta = attachedDatabase.localMetaDao;
    final reinstalled = {
      for (final record in activation.install) record.siteId,
    };
    if (activation.notices.isNotEmpty || reinstalled.isNotEmpty) {
      final current = decodeRemovalNotices(
        await meta.readValue(removalNoticesKey),
      );
      final merged = mergeRemovalNotices(
        current,
        activation.notices,
        reinstalled: reinstalled,
      );
      if (merged.isEmpty) {
        await meta.removeValue(removalNoticesKey);
      } else {
        await meta.writeValue(removalNoticesKey, encodeRemovalNotices(merged));
      }
    }
    for (final record in activation.install) {
      await _removeSite(record.siteId);
      await into(installedPublications).insert(
        InstalledPublicationsCompanion.insert(
          siteId: record.siteId,
          publicationId: record.publicationId,
          publicationNumber: record.publicationNumber,
          manifestHash: record.manifestHash,
          manifestText: record.manifestText,
          signatureKeyId: record.signatureKeyId,
          signature: record.signature,
          etareNumber: Value(record.etareNumber),
          siteName: record.siteName,
          publishedAt: record.publishedAt,
          installedAt: activation.now,
        ),
      );
      await batch((batch) {
        batch.insertAll(publicationFiles, [
          for (final file in record.files)
            PublicationFilesCompanion.insert(
              publicationId: record.publicationId,
              path: file.path,
              sha256: file.sha256,
              sizeBytes: file.sizeBytes,
              mediaType: file.mediaType,
              required: file.required,
            ),
        ]);
      });
      await into(siteData).insert(
        SiteDataCompanion.insert(
          siteId: record.siteId,
          publicationId: record.publicationId,
          dataText: record.dataText,
        ),
      );
      await into(siteSearch).insert(
        SiteSearchCompanion.insert(
          siteId: record.siteId,
          name: record.search.name,
          etareNumber: Value(record.search.etareNumber),
          addressLabel: Value(record.search.addressLabel),
          city: Value(record.search.city),
          searchText: record.search.searchText,
        ),
      );
    }

    await (update(
      syncState,
    )..where((t) => t.id.equals(SyncState.singletonId))).write(
      SyncStateCompanion(
        catalogGeneration: Value(activation.generation),
        activeGeneration: activation.complete
            ? Value(activation.generation)
            : const Value.absent(),
        lastSyncAt: activation.complete
            ? Value(activation.now)
            : const Value.absent(),
        lastAttemptAt: Value(activation.now),
        status: Value(activation.complete ? 'idle' : 'failed'),
        lastError: Value(activation.error),
        serverTime: Value(activation.serverTime),
        authorizedUserId: Value(activation.authorizedUserId),
        authorizationExpiresAt: Value(activation.authorizationExpiresAt),
        receiptPending: const Value(true),
        requiredAppVersion: Value(activation.requiredAppVersion),
        terminalPolicy: Value(activation.terminalPolicy),
      ),
    );
    await writeTimeAnchor(activation.timeAnchor);
    await _removeOrphanBlobs(activation.keepBlobs);
  });

  Future<void> _removeSite(String siteId) async {
    final current = await installedSite(siteId);
    if (current != null) {
      await (delete(
        publicationFiles,
      )..where((t) => t.publicationId.equals(current.publicationId))).go();
    }
    await (delete(
      installedPublications,
    )..where((t) => t.siteId.equals(siteId))).go();
    await (delete(siteData)..where((t) => t.siteId.equals(siteId))).go();
    await (delete(siteSearch)..where((t) => t.siteId.equals(siteId))).go();
  }

  /// Supprime les fichiers qu'aucune version installée ne référence, sauf
  /// ceux d'une installation en cours de reprise.
  Future<void> _removeOrphanBlobs(Set<String> keep) async {
    final referenced = publicationFiles.sha256;
    final orphans =
        await (selectOnly(fileBlobs)
              ..addColumns([fileBlobs.sha256])
              ..where(
                fileBlobs.sha256.isNotInQuery(
                  selectOnly(publicationFiles)..addColumns([referenced]),
                ),
              ))
            .map((row) => row.read(fileBlobs.sha256))
            .get();
    final removable = orphans.nonNulls.where((hash) => !keep.contains(hash));
    for (final hash in removable) {
      await (delete(fileChunks)..where((t) => t.sha256.equals(hash))).go();
      await (delete(fileBlobs)..where((t) => t.sha256.equals(hash))).go();
    }
  }

  /// Avis de retrait conservés, les plus récents d'abord (MET-04).
  Stream<List<RemovalNotice>> watchRemovalNotices() => attachedDatabase
      .localMetaDao
      .watchValue(removalNoticesKey)
      .map(decodeRemovalNotices);

  /// Revocation (OFF-04) : efface tout le contenu hors ligne et l'état.
  /// Une clé de publication vient d'être révoquée (SEC-04) : les sites
  /// sensibles ouverts à la demande sont refermés (rouverts, ils seront
  /// revérifiés) ; les consultations à remonter sont gardées.
  Future<void> closeOpenedSensitiveSites() =>
      attachedDatabase.sensitiveDao.purgeOtherUsers(null);

  Future<void> purgeAll() async {
    await transaction(() async {
      await attachedDatabase.sensitiveDao.purgeAll();
      await attachedDatabase.localMetaDao.removeValue(removalNoticesKey);
      await delete(publicationFiles).go();
      await delete(installedPublications).go();
      await delete(siteData).go();
      await delete(siteSearch).go();
      await delete(fileChunks).go();
      await delete(fileBlobs).go();
      await (update(
        syncState,
      )..where((t) => t.id.equals(SyncState.singletonId))).write(
        const SyncStateCompanion(
          activeGeneration: Value(null),
          lastSyncAt: Value(null),
          status: Value('never'),
          catalogGeneration: Value(null),
          lastAttemptAt: Value(null),
          lastError: Value(null),
          serverTime: Value(null),
          authorizedUserId: Value(null),
          authorizationExpiresAt: Value(null),
          receiptPending: Value(false),
          requiredAppVersion: Value(null),
        ),
      );
    });
    // Rend aussi à la base l'espace des pages libérées.
    await customStatement('VACUUM');
  }
}

/// Recherche locale (OPS-03) dans l'index des sites installés.
extension OfflineSearch on OfflineDao {
  /// Sites dont le texte normalisé contient TOUS les mots de [tokens],
  /// triés par nom ; tous les sites si [tokens] est vide.
  /// Sites installés localisés, pour la carte (CAR-02) : position lue dans
  /// les données publiées vérifiées, sans charger chaque fiche.
  Stream<List<SiteLocation>> watchSiteLocations() =>
      customSelect(
        'SELECT s.site_id AS site_id, s.name AS name, '
        's.etare_number AS etare_number, s.address_label AS address_label, '
        r"json_extract(d.data_text, '$.data.site.location.coordinates[0]') "
        'AS lon, '
        r"json_extract(d.data_text, '$.data.site.location.coordinates[1]') "
        'AS lat '
        'FROM site_search s JOIN site_data d ON d.site_id = s.site_id '
        'ORDER BY lower(s.name)',
        readsFrom: {siteSearch, siteData},
      ).watch().map(
        (rows) => [
          for (final row in rows)
            if (row.data['lon'] is num && row.data['lat'] is num)
              SiteLocation(
                siteId: row.read<String>('site_id'),
                name: row.read<String>('name'),
                etareNumber: row.readNullable<String>('etare_number'),
                addressLabel: row.readNullable<String>('address_label'),
                lon: (row.data['lon']! as num).toDouble(),
                lat: (row.data['lat']! as num).toDouble(),
              ),
        ],
      );

  Stream<List<SiteSearchRow>> watchSites(List<String> tokens) {
    final query = select(siteSearch);
    for (final token in tokens) {
      query.where((t) => t.searchText.contains(token));
    }
    query.orderBy([(t) => OrderingTerm(expression: t.name.lower())]);
    return query.watch();
  }
}
