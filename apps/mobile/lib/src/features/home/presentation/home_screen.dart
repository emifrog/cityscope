import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:etare_ops/src/features/sync/presentation/offline_status_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Accueil OPS : recherche locale d'un site (OPS-03) et fraîcheur des
/// données toujours visible (OPS-05). Tout est lu sur la tablette ; le réseau
/// ne sert qu'à la synchronisation, lancée à l'ouverture.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  static const searchFieldKey = Key('home.search');
  static const accountButtonKey = Key('home.account');
  static const reportsButtonKey = Key('home.reports');

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  @override
  void initState() {
    super.initState();
    // Synchronisation automatique à l'ouverture si la tablette est enrôlée :
    // la consultation reste locale, le réseau ne bloque jamais l'écran.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final identity = await ref.read(deviceIdentityProvider.future);
      if (identity != null && mounted) {
        ref.read(syncControllerProvider.notifier).synchronizeInBackground();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final identity = ref.watch(deviceIdentityProvider);
    final canConsult = ref.watch(offlineAccessProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(Brand.productName),
        actions: [
          const _ReportsButton(),
          IconButton(
            key: HomeScreen.accountButtonKey,
            tooltip: 'Compte et tablette',
            onPressed: () => context.push(AppRoutes.account),
            icon: const Icon(Icons.account_circle_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: switch (identity) {
          AsyncData(value: final DeviceIdentity device) =>
            canConsult
                ? _SiteSearch(device: device)
                : const _Message.syncRequired(),
          AsyncData() => ListView(
            padding: const EdgeInsets.all(16),
            children: const [OfflineStatusCard()],
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

/// Fraîcheur compacte, toujours en tête de l'accueil (OPS-05).
class FreshnessBanner extends ConsumerWidget {
  const FreshnessBanner({super.key});

  static const updateRequiredKey = Key('home.updateRequired');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(syncStatusProvider).value ?? SyncStatus.initial;
    final run = ref.watch(syncControllerProvider);
    final now = ref.watch(clockProvider)();
    final (label, color, icon) = freshnessStyle(status.freshness(now));
    final synced = status.lastSyncAt;
    return Material(
      color: color.withValues(alpha: 0.08),
      child: InkWell(
        onTap: () => context.push(AppRoutes.account),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      synced == null
                          ? label
                          : '$label · synchronisé le '
                                '${formatDateTimeFr(synced)}',
                      style: Theme.of(context).textTheme.bodyLarge
                          ?.copyWith(color: color, fontWeight: FontWeight.w600),
                    ),
                    // SYN-02 : les données restent lisibles, l'application
                    // doit être mise à jour pour recevoir les nouvelles.
                    if (status.appUpdateRequired)
                      Text(
                        'Mise à jour de l’application requise : touchez pour '
                        'le détail.',
                        key: FreshnessBanner.updateRequiredKey,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: BrandColors.important,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
              if (run is SyncRunInProgress)
                const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                IconButton(
                  tooltip: 'Synchroniser',
                  onPressed: () => ref
                      .read(syncControllerProvider.notifier)
                      .synchronizeInBackground(),
                  icon: const Icon(Icons.sync),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SiteSearch extends ConsumerWidget {
  const _SiteSearch({required this.device});

  final DeviceIdentity device;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(siteResultsProvider);
    final query = ref.watch(siteQueryProvider);
    return Column(
      children: [
        const FreshnessBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            key: HomeScreen.searchFieldKey,
            onChanged: ref.read(siteQueryProvider.notifier).set,
            textInputAction: TextInputAction.search,
            style: Theme.of(context).textTheme.titleMedium,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Nom, adresse, commune ou n° ETARE',
              border: const OutlineInputBorder(),
              helperText: device.tenantName,
            ),
          ),
        ),
        Expanded(
          child: switch (results) {
            AsyncData(value: final List<SiteSearchRow> sites)
                when sites.isEmpty =>
              query.isEmpty
                  ? const _Message.noSite()
                  : const _Message.noResult(),
            AsyncData(value: final List<SiteSearchRow> sites) =>
              ListView.separated(
                itemCount: sites.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) => _SiteTile(site: sites[index]),
              ),
            AsyncError() => const _Message.unreadable(),
            _ => const Center(child: CircularProgressIndicator()),
          },
        ),
      ],
    );
  }
}

class _SiteTile extends StatelessWidget {
  const _SiteTile({required this.site});

  final SiteSearchRow site;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final place = addressLine(site.addressLabel, site.city);
    return ListTile(
      minVerticalPadding: 12,
      leading: const Icon(Icons.apartment, size: 32),
      title: Text(site.name, style: textTheme.titleMedium),
      subtitle: Text(
        [
          if (site.etareNumber != null) 'ETARE ${site.etareNumber}',
          if (place.isNotEmpty) place,
        ].join('\n'),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(AppRoutes.site(site.siteId)),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message.noSite()
    : icon = Icons.inbox_outlined,
      text =
          'Aucun ETARE publié sur cette tablette. Synchronisez quand le '
          'réseau est disponible.';

  const _Message.noResult()
    : icon = Icons.search_off,
      text = 'Aucun site installé ne correspond à cette recherche.';

  const _Message.unreadable()
    : icon = Icons.error_outline,
      text = 'Index local illisible : relancez une synchronisation.';

  const _Message.syncRequired()
    : icon = Icons.lock_clock,
      text =
          'Consultation hors ligne non autorisée pour cette session : '
          'synchronisez la tablette (autorisation expirée ou autre '
          'utilisateur).';

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Icon(icon, size: 48, color: BrandColors.textMuted),
      const SizedBox(height: 12),
      Text(
        text,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyLarge,
      ),
      if (icon == Icons.lock_clock) ...[
        const SizedBox(height: 16),
        const OfflineStatusCard(),
      ],
    ],
  );
}

/// Accès aux signalements de l'agent, avec le nombre en attente d'envoi.
class _ReportsButton extends ConsumerWidget {
  const _ReportsButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingReportCountProvider).value ?? 0;
    return IconButton(
      key: HomeScreen.reportsButtonKey,
      tooltip: pending == 0
          ? 'Mes signalements'
          : 'Mes signalements ($pending en attente d’envoi)',
      onPressed: () => context.push(AppRoutes.reports),
      icon: Badge(
        isLabelVisible: pending > 0,
        label: Text('$pending'),
        child: const Icon(Icons.flag_outlined),
      ),
    );
  }
}
