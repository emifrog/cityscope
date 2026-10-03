import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/document_downloads.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/ops_scaffold.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Liste d'une entrée de la synthèse : risques par gravité, points par
/// criticité, plans par bâtiment et niveau, contacts, documents.
class SectionScreen extends ConsumerWidget {
  const SectionScreen({required this.siteId, required this.section, super.key});

  final String siteId;
  final OpsSection section;

  @override
  Widget build(BuildContext context, WidgetRef ref) => OpsScaffold(
    siteId: siteId,
    title: (site) => '${section.label} · ${site.shortName ?? site.name}',
    builder: (context, site) {
      final children = switch (section) {
        OpsSection.risks => [
          for (final risk in site.risks) _RiskTile(site: site, risk: risk),
        ],
        OpsSection.plans => [
          for (final plan in site.orderedPlans)
            _PlanTile(site: site, plan: plan),
        ],
        OpsSection.contacts => [
          for (final contact in site.contacts) _ContactCard(contact: contact),
        ],
        OpsSection.documents => [
          for (final document in site.tabletDocuments)
            _DocumentTile(site: site, document: document),
        ],
        _ => [
          for (final object in site.objectsOf(section.categories))
            _ObjectTile(site: site, object: object),
        ],
      };
      if (children.isEmpty) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Aucun élément « ${section.label} » dans la version publiée.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        );
      }
      return ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: children.length,
        separatorBuilder: (context, index) => const Divider(height: 1),
        itemBuilder: (context, index) => children[index],
      );
    },
  );
}

class _RiskTile extends StatelessWidget {
  const _RiskTile({required this.site, required this.risk});

  final PublishedSite site;
  final SiteRisk risk;

  @override
  Widget build(BuildContext context) {
    final color = severityColor(risk.severity);
    final location = site.locationOf(
      buildingId: risk.buildingId,
      levelId: risk.levelId,
      zoneId: risk.zoneId,
    );
    return ListTile(
      minVerticalPadding: 12,
      leading: CircleAvatar(
        backgroundColor: color,
        foregroundColor: BrandColors.onDark,
        child: Text('${risk.severity}'),
      ),
      title: Text(risk.title, style: Theme.of(context).textTheme.titleMedium),
      subtitle: Text(
        [
          if (risk.title != risk.typeName) risk.typeName,
          'gravité ${severityLabels[risk.severity]?.toLowerCase()}',
          if (risk.outdoor) 'à l’extérieur',
          ?location,
        ].join(' · '),
      ),
      trailing: risk.placement == null ? null : const Icon(Icons.map_outlined),
      onTap: () => showItemSheet(context, site, risk: risk),
    );
  }
}

class _ObjectTile extends StatelessWidget {
  const _ObjectTile({required this.site, required this.object});

  final PublishedSite site;
  final SiteObject object;

  @override
  Widget build(BuildContext context) {
    final color = objectCategoryColors[object.category] ?? BrandColors.navy;
    final location = site.locationOf(
      buildingId: object.buildingId,
      levelId: object.levelId,
      zoneId: object.zoneId,
    );
    return ListTile(
      minVerticalPadding: 12,
      leading: CircleAvatar(
        backgroundColor: object.outOfService ? BrandColors.critical : color,
        foregroundColor: BrandColors.onDark,
        child: Icon(object.outOfService ? Icons.block : Icons.place),
      ),
      title: Text(object.title, style: Theme.of(context).textTheme.titleMedium),
      subtitle: Text(
        [
          if (object.title != object.typeName) object.typeName,
          if (object.outOfService) 'HORS SERVICE',
          ?location,
        ].join(' · '),
      ),
      trailing: object.criticality == 'critical'
          ? const Icon(Icons.priority_high, color: BrandColors.critical)
          : null,
      onTap: () => showItemSheet(context, site, object: object),
    );
  }
}

class _PlanTile extends StatelessWidget {
  const _PlanTile({required this.site, required this.plan});

  final PublishedSite site;
  final SitePlan plan;

  @override
  Widget build(BuildContext context) {
    final where = site.locationOf(
      buildingId: plan.buildingId,
      levelId: plan.levelId,
    );
    final items =
        site.objects
            .where((o) => o.placement?.planRevisionId == plan.revisionId)
            .length +
        site.risks
            .where((r) => r.placement?.planRevisionId == plan.revisionId)
            .length;
    return ListTile(
      minVerticalPadding: 12,
      leading: const Icon(Icons.map_outlined, size: 32),
      title: Text(plan.title, style: Theme.of(context).textTheme.titleMedium),
      subtitle: Text(
        [
          planTypeLabels[plan.planType] ?? plan.planType,
          ?where,
          '$items élément(s)',
        ].join(' · '),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(AppRoutes.plan(site.siteId, plan.id)),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.contact});

  final SiteContact contact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    Widget phone(String number) => Row(
      children: [
        const Icon(Icons.phone, color: BrandColors.success),
        const SizedBox(width: 8),
        Expanded(
          child: SelectableText(
            number,
            style: textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Copier le numéro',
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: number));
            if (context.mounted) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text('Numéro copié : $number')));
            }
          },
          icon: const Icon(Icons.copy),
        ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(contact.name, style: textTheme.titleMedium),
          if (contact.role != null)
            Text(contact.role!, style: textTheme.bodyMedium),
          const SizedBox(height: 4),
          if (contact.phone.isNotEmpty) phone(contact.phone),
          if (contact.phoneAlt case final alt?) phone(alt),
          if (contact.availability != null)
            Text('Disponibilité : ${contact.availability}'),
          if (contact.verifiedAt case final verified?)
            Text(
              'Vérifié le ${formatDateFr(verified)}',
              style: textTheme.bodySmall?.copyWith(
                color: BrandColors.textMuted,
              ),
            ),
        ],
      ),
    );
  }
}

class _DocumentTile extends ConsumerWidget {
  const _DocumentTile({required this.site, required this.document});

  final PublishedSite site;
  final SiteDocument document;

  static Key keyOf(SiteDocument document) => Key('document.${document.id}');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expired =
        document.expiresAt != null &&
        document.expiresAt!.isBefore(DateTime.now().toUtc());
    final availability = document.onDemand
        ? _availability(ref, (
            siteId: site.siteId,
            sha256: document.assetSha256,
          ))
        : null;
    return ListTile(
      key: keyOf(document),
      minVerticalPadding: 12,
      leading: Icon(
        document.mimeType.startsWith('image/')
            ? Icons.image_outlined
            : Icons.picture_as_pdf_outlined,
        size: 32,
      ),
      title: Text(
        document.title,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            [
              documentCategoryLabels[document.category] ?? document.category,
              'version ${document.versionNo}',
              if (document.expiresAt case final expires?)
                '${expired ? 'expirée le' : 'valable jusqu’au'} ${formatDateFr(expires)}',
            ].join(' · '),
            style: expired
                ? const TextStyle(color: BrandColors.critical)
                : null,
          ),
          if (availability case (final text, final color)) ...[
            const SizedBox(height: 2),
            Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => DocumentScreen(
            title: document.title,
            sha256: document.assetSha256,
            mimeType: document.mimeType,
            onDemandSiteId: document.onDemand ? site.siteId : null,
          ),
        ),
      ),
    );
  }

  /// État d'un document « à la demande » : sur la tablette, à télécharger
  /// (avec sa taille), en cours ou en échec (DOC-02).
  static (String, Color) _availability(WidgetRef ref, SiteFile file) {
    final size = ref.watch(installedFileInfoProvider(file)).value?.sizeBytes;
    final sizeText = size == null ? '' : ' · ${formatBytesFr(size)}';
    final present = ref.watch(fileOnTabletProvider(file.sha256)).value ?? false;
    return switch (ref.watch(documentDownloadProvider(file))) {
      _ when present => ('Sur la tablette$sizeText', BrandColors.success),
      DocumentDownloading(:final fraction) => (
        fraction == null
            ? 'Téléchargement…'
            : 'Téléchargement… ${(fraction * 100).round()} %',
        BrandColors.info,
      ),
      DocumentDownloadFailed() => (
        'Téléchargement échoué : touchez pour réessayer',
        BrandColors.critical,
      ),
      DocumentDownloadIdle() => (
        'À télécharger (réseau nécessaire)$sizeText',
        BrandColors.important,
      ),
    };
  }
}
