import 'dart:async';

import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/core/theme/ui_kit.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Signalements de l'agent et suite donnée par la Prévision (TER-05) :
/// « en attente » tant qu'ils ne sont pas transmis, « reçu » pendant
/// l'instruction, « traité » une fois décidé.
class MyReportsScreen extends ConsumerWidget {
  const MyReportsScreen({super.key});

  static const sendKey = Key('reports.send');
  static Key cardKey(String clientReportId) => Key('reports.$clientReportId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reports = ref.watch(myReportsProvider);
    final outbox = ref.watch(reportOutboxProvider);
    final pending = ref.watch(pendingReportCountProvider).value ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes signalements'),
        actions: [
          IconButton(
            key: sendKey,
            // Transmet ce qui attend et rapporte la suite donnée par la Prévision.
            tooltip: 'Envoyer et actualiser',
            onPressed: outbox.sending
                ? null
                : () => ref
                      .read(reportOutboxProvider.notifier)
                      .sendInBackground(),
            icon: outbox.sending
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
          ),
        ],
      ),
      body: SafeArea(
        child: switch (reports) {
          AsyncData(value: final items) when items.isEmpty => const EmptyState(
            icon: Icons.flag_outlined,
            title: 'Aucun signalement',
            text:
                'Depuis un site, la fiche d’un point ou le plan : '
                '« Signaler un écart ».',
          ),
          AsyncData(value: final items) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (pending > 0)
                _PendingNotice(
                  count: pending,
                  offline: outbox.lastSummary?.offline ?? false,
                ),
              for (final report in items)
                _ReportCard(
                  key: cardKey(report.clientReportId),
                  report: report,
                  now: ref.watch(clockProvider)(),
                ),
            ],
          ),
          AsyncError() => const EmptyState(
            icon: Icons.error_outline,
            tone: Tone.critical,
            title: 'Signalements illisibles',
            text: 'Signalements illisibles.',
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _PendingNotice extends StatelessWidget {
  const _PendingNotice({required this.count, required this.offline});

  final int count;
  final bool offline;

  @override
  Widget build(BuildContext context) => NoticeStrip(
    icon: Icons.outbox_outlined,
    tone: Tone.important,
    text: count == 1
        ? '1 signalement en attente d’envoi'
        : '$count signalements en attente d’envoi',
    detail: offline
        ? 'Pas de réseau : envoi automatique au retour de la connexion.'
        : 'Envoi automatique à chaque synchronisation.',
  );
}

class _ReportCard extends ConsumerWidget {
  const _ReportCard({required this.report, required this.now, super.key});

  final FieldReportRow report;
  final DateTime now;

  Future<void> _discard(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer ce signalement ?'),
        content: Text(
          report.localState == 'sent'
              ? 'Il disparaît de la tablette ; la Prévision le conserve.'
              : 'Il n’a pas été transmis : il sera définitivement perdu.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) {
      await ref
          .read(reportOutboxProvider.notifier)
          .discard(report.clientReportId);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final state = agentStateOf(report);
    final category = ReportCategory.fromWire(report.category);
    final severity = ReportSeverity.fromWire(report.severity);
    final (String label, Tone tone) = switch (state) {
      AgentReportState.pending => ('En attente d’envoi', Tone.important),
      AgentReportState.received => (
        report.serverStatus == 'triaged' ? 'Reçu, pris en charge' : 'Reçu',
        Tone.info,
      ),
      AgentReportState.processed =>
        report.serverStatus == 'rejected'
            ? ('Traité : rejeté', Tone.neutral)
            : ('Traité', Tone.success),
      AgentReportState.refused => ('Refusé par le serveur', Tone.critical),
    };
    final resolution = switch ((
      report.resolutionRevisionNo,
      report.resolutionPublicationNumber,
    )) {
      (_, final int publication) =>
        'Correction publiée : version $publication.',
      (final int revision, null) =>
        'Correction en préparation (révision $revision).',
      _ => null,
    };
    final observed = DateTime.parse(report.observedAt);
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PictoBox(icon: category.icon, tone: tone),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '${report.siteName} · ${category.label}',
                        style: textTheme.titleMedium,
                      ),
                      StatusBadge(label, tone: tone),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(report.description, style: textTheme.bodyLarge),
                  const SizedBox(height: 6),
                  Text(
                    [
                      severity.label,
                      'constaté ${formatRelativeFr(observed, now)}, le ${formatDateTimeFr(observed)}',
                      ?report.itemLabel,
                      if (report.photoCount > 0)
                        report.photoCount == 1
                            ? '1 photo'
                            : '${report.photoCount} photos',
                    ].join(' · '),
                    style: textTheme.bodyMedium?.copyWith(
                      color: BrandColors.textMuted,
                    ),
                  ),
                  if (state == AgentReportState.pending &&
                      report.lastError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Dernier essai : ${report.lastError}',
                        style: textTheme.bodyMedium?.copyWith(
                          color: BrandColors.textMuted,
                        ),
                      ),
                    ),
                  if (state == AgentReportState.refused)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        report.lastError ?? 'Signalement refusé.',
                        style: textTheme.bodyLarge?.copyWith(
                          color: BrandColors.critical,
                        ),
                      ),
                    ),
                  if (report.decisionComment case final comment?) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: tone == Tone.success
                            ? BrandColors.successSoft
                            : BrandColors.subtle,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Réponse de la Prévision',
                            style: textTheme.titleSmall,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Prévision : $comment',
                            style: textTheme.bodyLarge,
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (resolution != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(resolution, style: textTheme.bodyMedium),
                    ),
                  if (state != AgentReportState.received)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        onPressed: () => unawaited(_discard(context, ref)),
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Supprimer'),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
