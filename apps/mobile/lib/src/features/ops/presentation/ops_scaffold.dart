import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Cadre commun des écrans d'un site : charge la version installée et ne
/// montre rien sans autorisation de consultation locale.
class OpsScaffold extends ConsumerWidget {
  const OpsScaffold({
    required this.siteId,
    required this.title,
    required this.builder,
    this.actions = const [],
    super.key,
  });

  final String siteId;
  final String Function(PublishedSite site) title;
  final Widget Function(BuildContext context, PublishedSite site) builder;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(offlineAccessProvider)) {
      return const _Blocked(
        'Consultation hors ligne non autorisée : synchronisez la tablette.',
      );
    }
    final site = ref.watch(publishedSiteProvider(siteId));
    return switch (site) {
      AsyncData(value: final PublishedSite site) => Scaffold(
        appBar: AppBar(title: Text(title(site)), actions: actions),
        body: SafeArea(child: builder(context, site)),
      ),
      AsyncData() => _Blocked(_removedMessage(ref, siteId)),
      AsyncError() => const _Blocked(
        'Données de ce site illisibles : relancez une synchronisation.',
      ),
      _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
    };
  }
}

/// Site absent : avec la raison donnée par le SIS quand elle est connue (MET-04).
String _removedMessage(WidgetRef ref, String siteId) {
  final notice = ref
      .watch(removalNoticesProvider)
      .value
      ?.where((candidate) => candidate.siteId == siteId)
      .firstOrNull;
  if (notice == null) return 'Ce site n’est plus installé sur la tablette.';
  return 'Ce site n’est plus installé sur la tablette. ${notice.label} le '
      '${formatDateTimeFr(notice.at)} : « ${notice.reason} »';
}

class _Blocked extends StatelessWidget {
  const _Blocked(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge
              ?.copyWith(color: BrandColors.textMuted),
        ),
      ),
    ),
  );
}
