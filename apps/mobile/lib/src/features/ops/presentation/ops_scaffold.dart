import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
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
      AsyncData() => const _Blocked(
        'Ce site n’est plus installé sur la tablette.',
      ),
      AsyncError() => const _Blocked(
        'Données de ce site illisibles : relancez une synchronisation.',
      ),
      _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
    };
  }
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
