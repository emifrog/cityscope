import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/sync/application/document_downloader.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Un document d'un site installé, désigné par son empreinte.
typedef SiteFile = ({String siteId, String sha256});

final documentDownloaderProvider = Provider<DocumentDownloader>((ref) {
  final database = ref.watch(appDatabaseProvider);
  return DocumentDownloader(
    api: ref.watch(syncApiProvider),
    offline: database.offlineDao,
    identities: ref.watch(deviceIdentityStoreProvider),
    clock: ref.watch(clockProvider),
  );
});

/// Le fichier est-il sur la tablette (suivi en continu) ?
final fileOnTabletProvider = StreamProvider.family<bool, String>(
  (ref, sha256) =>
      ref.watch(appDatabaseProvider).offlineDao.watchBlobPresent(sha256),
);

/// Fichier tel que le manifeste signé de la version installée le décrit
/// (taille à télécharger, obligatoire ou non).
final installedFileInfoProvider =
    FutureProvider.family<PublicationFileRow?, SiteFile>((ref, file) {
      ref.watch(
        syncStatusProvider.select((status) => status.value?.lastSyncAt),
      );
      return ref
          .watch(appDatabaseProvider)
          .offlineDao
          .installedFile(file.siteId, file.sha256);
    });

/// Téléchargement d'un document « à la demande » en cours ou échoué.
@immutable
sealed class DocumentDownloadState {
  const DocumentDownloadState();
}

final class DocumentDownloadIdle extends DocumentDownloadState {
  const DocumentDownloadIdle();
}

final class DocumentDownloading extends DocumentDownloadState {
  const DocumentDownloading({this.received = 0, this.total = 0});

  final int received;
  final int total;

  double? get fraction =>
      total <= 0 ? null : (received / total).clamp(0, 1).toDouble();
}

final class DocumentDownloadFailed extends DocumentDownloadState {
  const DocumentDownloadFailed(this.message);

  final String message;
}

/// Message exact quand le réseau manque pour un document non téléchargé.
const documentOfflineMessage =
    'Pas de réseau : ce document n’est pas encore sur la tablette. '
    'Réessayez une fois connecté ; il restera ensuite consultable sans réseau.';

final documentDownloadProvider =
    NotifierProvider.family<
      DocumentDownloadController,
      DocumentDownloadState,
      SiteFile
    >(DocumentDownloadController.new);

/// Téléchargement explicite (DOC-02) : l'agent le lance, voit sa progression
/// et un message exact en cas d'échec ; il continue si l'écran est quitté.
class DocumentDownloadController extends Notifier<DocumentDownloadState> {
  DocumentDownloadController(this.file);

  static const _logger = AppLogger('documents');

  final SiteFile file;

  @override
  DocumentDownloadState build() => const DocumentDownloadIdle();

  Future<void> download() async {
    if (state is DocumentDownloading) return;
    state = const DocumentDownloading();
    try {
      await ref
          .read(documentDownloaderProvider)
          .download(
            siteId: file.siteId,
            sha256: file.sha256,
            onProgress: (received, total) =>
                state = DocumentDownloading(received: received, total: total),
          );
      ref.invalidate(installedFileProvider(file.sha256));
      state = const DocumentDownloadIdle();
    } on DocumentDownloadException catch (error) {
      state = DocumentDownloadFailed(error.failure.message);
    } on NetworkException {
      state = const DocumentDownloadFailed(documentOfflineMessage);
    } on ApiException catch (error) {
      _logger.warning('Document non téléchargé.', error: error);
      switch (error.code) {
        case ApiErrorCode.deviceRevoked ||
            ApiErrorCode.deviceNotEnrolled ||
            ApiErrorCode.deviceProofInvalid:
          // La synchronisation constate le refus et purge la tablette.
          ref.read(syncControllerProvider.notifier).synchronizeInBackground();
          state = DocumentDownloadFailed(describeError(error));
        case ApiErrorCode.notFound:
          state = DocumentDownloadFailed(
            DocumentDownloadFailure.unavailable.message,
          );
        default:
          state = DocumentDownloadFailed(describeError(error));
      }
    } on Object catch (error) {
      _logger.warning('Document non téléchargé.', error: error);
      state = DocumentDownloadFailed(describeError(error));
    }
  }

  /// Retire le document de la tablette (place libérée).
  Future<void> discard() async {
    await ref.read(documentDownloaderProvider).discard(file.sha256);
    ref.invalidate(installedFileProvider(file.sha256));
    state = const DocumentDownloadIdle();
  }
}
