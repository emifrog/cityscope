import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/core/theme/ui_kit.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/document_availability.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/ops_scaffold.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Liste d'une entrée de la synthèse : risques par gravité puis points à
/// risque, points par criticité, plans par bâtiment et niveau, contacts,
/// documents, galerie des photos (même ordre que l'aperçu et le PDF).
class SectionScreen extends ConsumerWidget {
  const SectionScreen({required this.siteId, required this.section, super.key});

  final String siteId;
  final OpsSection section;

  @override
  Widget build(BuildContext context, WidgetRef ref) => OpsScaffold(
    siteId: siteId,
    title: (site) => '${section.label} · ${site.shortName ?? site.name}',
    builder: (context, site) {
      if (section == OpsSection.photos && site.shows(section)) {
        return _Gallery(site: site);
      }
      final children = switch (section) {
        _ when !site.shows(section) => const <Widget>[],
        OpsSection.risks => [
          for (final risk in site.risks) _RiskTile(site: site, risk: risk),
          for (final object in site.objectsOf(section.categories))
            _ObjectTile(site: site, object: object),
          // Matières dangereuses et FDS (RISK-03), après les risques.
          if (site.substances.isNotEmpty) ...[
            const _Heading('Matières dangereuses'),
            for (final substance in site.substances)
              _SubstanceTile(site: site, substance: substance),
          ],
        ],
        OpsSection.plans => [
          for (final plan in site.orderedPlans)
            _PlanTile(site: site, plan: plan),
        ],
        OpsSection.contacts => [
          for (final contact in site.contacts) _ContactCard(contact: contact),
        ],
        OpsSection.annexes => [
          for (final document in site.tabletDocuments)
            _DocumentTile(site: site, document: document),
        ],
        _ => [
          for (final object in site.objectsOf(section.categories))
            _ObjectTile(site: site, object: object),
        ],
      };
      if (children.isEmpty) {
        return EmptyState(
          icon: section.icon,
          title: site.shows(section)
              ? 'Rien dans cette section'
              : 'Section masquée par le SIS',
          text: site.shows(section)
              ? 'Aucun élément « ${section.label} » dans la version publiée.'
              : 'Section « ${section.label} » masquée par le SIS ; ses points restent sur les plans.',
        );
      }
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (index, child) in children.indexed) ...[
                  if (index > 0 && child is! _Heading) const Divider(height: 1),
                  child,
                ],
              ],
            ),
          ),
        ],
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
    return OpsRow(
      leading: PictoBox(
        color: BrandColors.onDark,
        background: color,
        child: Text(
          '${risk.severity}',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: BrandColors.onDark,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      title: risk.title,
      subtitle: [
        if (risk.title != risk.typeName) risk.typeName,
        'gravité ${severityLabels[risk.severity]?.toLowerCase()}',
        if (risk.outdoor) 'à l’extérieur',
        ?location,
      ].join(' · '),
      trailing: risk.placement == null
          ? const Icon(Icons.chevron_right, color: BrandColors.textMuted)
          : const Icon(Icons.map_outlined, color: BrandColors.navy),
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
    return OpsRow(
      leading: PictoBox(
        icon: object.outOfService ? Icons.block : Icons.place,
        color: BrandColors.onDark,
        background: object.outOfService ? BrandColors.critical : color,
      ),
      title: object.title,
      subtitle: [
        if (object.title != object.typeName) object.typeName,
        if (object.outOfService) 'HORS SERVICE',
        ?location,
      ].join(' · '),
      trailing: object.criticality == 'critical'
          ? const Icon(Icons.priority_high, color: BrandColors.critical)
          : const Icon(Icons.chevron_right, color: BrandColors.textMuted),
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
    return OpsRow(
      leading: const PictoBox(icon: Icons.map_outlined),
      title: plan.title,
      subtitle: [
        planTypeLabels[plan.planType] ?? plan.planType,
        ?where,
        '$items élément(s)',
      ].join(' · '),
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PictoBox(icon: Icons.person_outline),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(contact.name, style: textTheme.titleMedium),
                if (contact.role case final role?)
                  Text(
                    role,
                    style: textTheme.bodyMedium?.copyWith(
                      color: BrandColors.textMuted,
                    ),
                  ),
                const SizedBox(height: 4),
                if (contact.phone.isNotEmpty) phone(contact.phone),
                if (contact.phoneAlt case final alt?) phone(alt),
                if (contact.email case final email?)
                  SelectableText(email, style: textTheme.bodyMedium),
                if (contact.availability case final availability?)
                  Text('Disponibilité : $availability'),
                if (contact.verifiedAt case final verified?)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: StatusBadge(
                      'Vérifié le ${formatDateFr(verified)}',
                      tone: Tone.success,
                      icon: Icons.verified_outlined,
                    ),
                  ),
              ],
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
        ? documentAvailability(ref, (
            siteId: site.siteId,
            sha256: document.assetSha256,
          ))
        : null;
    final textTheme = Theme.of(context).textTheme;
    return InkWell(
      key: keyOf(document),
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
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            PictoBox(
              icon: document.mimeType.startsWith('image/')
                  ? Icons.image_outlined
                  : Icons.picture_as_pdf_outlined,
              tone: expired ? Tone.critical : Tone.navy,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(document.title, style: textTheme.titleMedium),
                  Text(
                    [
                      documentCategoryLabels[document.category] ??
                          document.category,
                      'version ${document.versionNo}',
                      if (document.expiresAt case final expires?)
                        '${expired ? 'expirée le' : 'valable jusqu’au'} ${formatDateFr(expires)}',
                    ].join(' · '),
                    style: textTheme.bodyMedium?.copyWith(
                      color: expired
                          ? BrandColors.critical
                          : BrandColors.textMuted,
                    ),
                  ),
                  if (availability case (final text, final color)) ...[
                    const SizedBox(height: 2),
                    Text(
                      text,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, color: BrandColors.textMuted),
          ],
        ),
      ),
    );
  }
}

/// Titre d'un groupe dans une liste (« Matières dangereuses »).
class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: BrandColors.subtle,
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleSmall
          ?.copyWith(color: BrandColors.textMuted),
    ),
  );
}

/// Matière dangereuse (RISK-03) : classes de danger, quantité, emplacement ;
/// la FDS est signalée quand la version en publie une.
class _SubstanceTile extends StatelessWidget {
  const _SubstanceTile({required this.site, required this.substance});

  final PublishedSite site;
  final SiteSubstance substance;

  static Key keyOf(SiteSubstance substance) => Key('substance.${substance.id}');

  @override
  Widget build(BuildContext context) {
    final location =
        site.locationOf(
          buildingId: substance.buildingId,
          levelId: substance.levelId,
          zoneId: substance.zoneId,
        ) ??
        substance.locationNote;
    final classes = [
      for (final hazardClass in substance.hazardClasses)
        hazardClassLabels[hazardClass] ?? hazardClass,
    ].join(', ');
    return OpsRow(
      key: keyOf(substance),
      leading: const PictoBox(
        icon: Icons.science_outlined,
        color: BrandColors.onDark,
        background: riskColor,
      ),
      title: substance.name,
      subtitle: [
        if (classes.isNotEmpty) classes,
        ?substance.quantityLabel,
        ?location,
      ].join(' · '),
      trailing: substance.fds == null
          ? const Icon(Icons.chevron_right, color: BrandColors.textMuted)
          : const Icon(Icons.picture_as_pdf_outlined, color: BrandColors.navy),
      onTap: () => showItemSheet(context, site, substance: substance),
    );
  }
}

/// Galerie des photos des points (ADR-026) ; un appui ouvre la photo.
class _Gallery extends ConsumerWidget {
  const _Gallery({required this.site});

  final PublishedSite site;

  static Key photoKey(String photoId) => Key('gallery.photo.$photoId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photos = site.gallery;
    if (photos.isEmpty) {
      return const EmptyState(
        icon: Icons.photo_library_outlined,
        title: 'Aucune photo',
        text: 'Aucune photo dans la version publiée.',
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 260,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.8,
      ),
      itemCount: photos.length,
      itemBuilder: (context, index) {
        final entry = photos[index];
        final caption = entry.photo.caption ?? 'Sans légende';
        final file = ref.watch(installedFileProvider(entry.photo.assetSha256));
        return Semantics(
          button: true,
          label: '$caption, ${entry.object.title}',
          excludeSemantics: true,
          child: InkWell(
            key: photoKey(entry.photo.id),
            borderRadius: BorderRadius.circular(12),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => DocumentScreen(
                  title: entry.object.title,
                  sha256: entry.photo.assetSha256,
                  mimeType: entry.photo.mimeType,
                  caption: caption,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox.expand(
                      child: switch (file) {
                        AsyncData(value: final bytes?) => Image.memory(
                          bytes,
                          fit: BoxFit.cover,
                          cacheWidth: 520,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.broken_image_outlined,
                            color: BrandColors.textMuted,
                          ),
                        ),
                        AsyncLoading() => const ColoredBox(
                          color: BrandColors.subtle,
                        ),
                        _ => const Icon(
                          Icons.broken_image_outlined,
                          color: BrandColors.textMuted,
                        ),
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(
                  '${entry.object.title} · ${entry.section.label}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: BrandColors.textMuted),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
