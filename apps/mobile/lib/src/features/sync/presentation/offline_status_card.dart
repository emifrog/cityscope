import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Libellé et couleur de la fraîcheur, toujours visibles (OPS-05).
(String, Color, IconData) freshnessStyle(Freshness freshness) =>
    switch (freshness) {
      Freshness.upToDate => ('À jour', BrandColors.success, Icons.offline_pin),
      Freshness.late => ('En retard', BrandColors.important, Icons.schedule),
      Freshness.error => (
        'Erreur de synchronisation',
        BrandColors.critical,
        Icons.sync_problem,
      ),
      Freshness.never => (
        'Jamais synchronisé',
        BrandColors.textMuted,
        Icons.cloud_off_outlined,
      ),
    };

/// État hors ligne de la tablette : enrôlement, fraîcheur, autorisation
/// locale, synchronisation et sa progression (OFF-01, OFF-04, OPS-05).
class OfflineStatusCard extends ConsumerWidget {
  const OfflineStatusCard({super.key});

  static const enrollButtonKey = Key('offline.enroll');
  static const syncButtonKey = Key('offline.sync');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final identity = ref.watch(deviceIdentityProvider);
    final run = ref.watch(syncControllerProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: switch (identity) {
          AsyncData(value: final DeviceIdentity device) => _Enrolled(
            device: device,
            run: run,
          ),
          AsyncData() => _NotEnrolled(run: run),
          AsyncError() => const Text('Identité de la tablette illisible.'),
          _ => const LinearProgressIndicator(),
        },
      ),
    );
  }
}

class _NotEnrolled extends StatelessWidget {
  const _NotEnrolled({required this.run});

  final SyncRunState run;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final purge = switch (run) {
      SyncRunFinished(report: SyncPurged(:final reason)) => reason,
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.tablet_android, color: BrandColors.important),
            const SizedBox(width: 12),
            Expanded(
              child: Text('Tablette non enrôlée', style: textTheme.titleMedium),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (purge != null)
          Text(
            purgeMessage(purge),
            style: textTheme.bodyLarge?.copyWith(color: BrandColors.critical),
          )
        else
          Text(
            'Pour consulter les ETARE publiés sans réseau, enrôlez la tablette '
            'avec le code remis par l’administrateur de votre SIS.',
            style: textTheme.bodyLarge,
          ),
        const SizedBox(height: 12),
        FilledButton.icon(
          key: OfflineStatusCard.enrollButtonKey,
          onPressed: () => context.push(AppRoutes.enroll),
          icon: const Icon(Icons.qr_code_2),
          label: const Text('Enrôler cette tablette'),
        ),
      ],
    );
  }
}

class _Enrolled extends ConsumerWidget {
  const _Enrolled({required this.device, required this.run});

  final DeviceIdentity device;
  final SyncRunState run;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final status = ref.watch(syncStatusProvider).value ?? SyncStatus.initial;
    final now = ref.watch(clockProvider)();
    final userId = ref.watch(
      authControllerProvider.select((state) => state.value?.user.id),
    );
    final (label, color, icon) = freshnessStyle(status.freshness(now));
    final running = run is SyncRunInProgress;
    final canConsult = status.canConsult(userId: userId, now: now);
    final expiresAt = status.authorizationExpiresAt;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '$label · ${status.installedSites} site(s) hors ligne',
                style: textTheme.titleMedium?.copyWith(color: color),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Dernière synchronisation réussie : '
          '${status.lastSyncAt == null ? 'jamais' : formatDateTimeFr(status.lastSyncAt!)}',
          style: textTheme.bodyLarge,
        ),
        Text(
          '${device.deviceName} · ${device.tenantName}',
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
        if (status.lastError case final error? when !running) ...[
          const SizedBox(height: 8),
          Text(
            error,
            style: textTheme.bodyMedium?.copyWith(color: BrandColors.critical),
          ),
        ],
        if (status.installedSites > 0) ...[
          const SizedBox(height: 8),
          Text(
            canConsult && expiresAt != null
                ? 'Consultation hors ligne autorisée jusqu’au '
                      '${formatDateTimeFr(expiresAt)}.'
                : 'Synchronisez pour consulter les données de cette tablette '
                      '(autorisation expirée ou autre utilisateur).',
            style: textTheme.bodyMedium?.copyWith(
              color: canConsult ? BrandColors.textMuted : BrandColors.important,
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (run case SyncRunInProgress(:final progress))
          _Progress(progress: progress)
        else ...[
          if (run case SyncRunFailed(:final message))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                message,
                style: textTheme.bodyMedium?.copyWith(
                  color: BrandColors.critical,
                ),
              ),
            ),
          if (run case SyncRunFinished(report: final SyncCompleted report))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_summary(report), style: textTheme.bodyMedium),
            ),
          OutlinedButton.icon(
            key: OfflineStatusCard.syncButtonKey,
            onPressed: () => ref
                .read(syncControllerProvider.notifier)
                .synchronizeInBackground(),
            icon: const Icon(Icons.sync),
            label: const Text('Synchroniser'),
          ),
        ],
      ],
    );
  }

  static String _summary(SyncCompleted report) {
    final parts = <String>[
      if (report.installed > 0) '${report.installed} version(s) installée(s)',
      if (report.removed > 0) '${report.removed} site(s) retiré(s)',
      if (report.unchanged > 0) '${report.unchanged} site(s) déjà à jour',
      if (report.downloadedBytes > 0)
        '${formatBytesFr(report.downloadedBytes)} téléchargés',
    ];
    return parts.isEmpty
        ? 'Aucun ETARE publié à installer.'
        : '${parts.join(', ')}.';
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.progress});

  final SyncProgress progress;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final label = switch (progress.step) {
      SyncStep.catalog => 'Vérification du catalogue…',
      SyncStep.downloading =>
        'Téléchargement ${progress.sitesDone + 1}/${progress.sitesTotal}'
            '${progress.siteName == null ? '' : ' : ${progress.siteName}'}',
      SyncStep.installing => 'Installation…',
      SyncStep.receipt => 'Accusé de réception…',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: textTheme.bodyMedium),
        const SizedBox(height: 8),
        LinearProgressIndicator(value: progress.fraction),
        if (progress.totalBytes > 0) ...[
          const SizedBox(height: 4),
          Text(
            '${formatBytesFr(progress.doneBytes)} / '
            '${formatBytesFr(progress.totalBytes)}',
            style: textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

/// Message lisible d'une purge (révocation, terminal inconnu).
String purgeMessage(ApiErrorCode reason) => switch (reason) {
  ApiErrorCode.deviceRevoked =>
    'Tablette révoquée par votre SIS : données hors ligne effacées.',
  _ => 'Tablette inconnue du serveur : données effacées, réenrôlez-la.',
};
