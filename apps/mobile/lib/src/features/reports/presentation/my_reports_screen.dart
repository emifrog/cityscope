import 'dart:async';

import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
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
          AsyncData(value: final items) when items.isEmpty => const _Empty(),
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
                ),
            ],
          ),
          AsyncError() => const Center(child: Text('Signalements illisibles.')),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        'Aucun signalement. Depuis un site, la fiche d’un point ou le plan : '
        '« Signaler un écart ».',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyLarge
            ?.copyWith(color: BrandColors.textMuted),
      ),
    ),
  );
}

class _PendingNotice extends StatelessWidget {
  const _PendingNotice({required this.count, required this.offline});

  final int count;
  final bool offline;

  @override
  Widget build(BuildContext context) => Card(
    color: BrandColors.important.withValues(alpha: 0.08),
    child: ListTile(
      leading: const Icon(Icons.outbox_outlined, color: BrandColors.important),
      title: Text(
        count == 1
            ? '1 signalement en attente d’envoi'
            : '$count signalements en attente d’envoi',
      ),
      subtitle: Text(
        offline
            ? 'Pas de réseau : envoi automatique au retour de la connexion.'
            : 'Envoi automatique à chaque synchronisation.',
      ),
    ),
  );
}

class _ReportCard extends ConsumerWidget {
  const _ReportCard({required this.report, super.key});

  final FieldReportRow report;

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
    final (String label, Color color) = switch (state) {
      AgentReportState.pending => ('En attente d’envoi', BrandColors.important),
      AgentReportState.received => (
        report.serverStatus == 'triaged' ? 'Reçu, pris en charge' : 'Reçu',
        BrandColors.navy,
      ),
      AgentReportState.processed =>
        report.serverStatus == 'rejected'
            ? ('Traité : rejeté', BrandColors.textMuted)
            : ('Traité', BrandColors.success),
      AgentReportState.refused => (
        'Refusé par le serveur',
        BrandColors.critical,
      ),
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
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(category.icon, color: BrandColors.navy),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${report.siteName} · ${category.label}',
                    style: textTheme.titleMedium,
                  ),
                ),
                _Chip(label, color),
              ],
            ),
            const SizedBox(height: 8),
            Text(report.description, style: textTheme.bodyLarge),
            const SizedBox(height: 8),
            Text(
              [
                severity.label,
                'constaté le ${formatDateTimeFr(DateTime.parse(report.observedAt))}',
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
            if (state == AgentReportState.pending && report.lastError != null)
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
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: BrandColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: BrandColors.border),
                ),
                child: Text('Prévision : $comment', style: textTheme.bodyLarge),
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
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.color);

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color),
    ),
    child: Text(
      label,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(color: color),
    ),
  );
}
