import 'dart:async';

import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Fiche d'un point, d'un risque ou d'une zone (PLAN-03 côté terrain),
/// ouverte depuis une liste ou depuis le plan.
Future<void> showItemSheet(
  BuildContext context,
  PublishedSite site, {
  SiteObject? object,
  SiteRisk? risk,
  SiteZone? zone,
  bool fromPlan = false,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: 0.55,
    maxChildSize: 0.95,
    builder: (context, controller) => ItemSheet(
      site: site,
      object: object,
      risk: risk,
      zone: zone,
      fromPlan: fromPlan,
      controller: controller,
    ),
  ),
);

class ItemSheet extends StatelessWidget {
  const ItemSheet({
    required this.site,
    this.object,
    this.risk,
    this.zone,
    this.fromPlan = false,
    this.controller,
    super.key,
  });

  static const planButtonKey = Key('item.plan');
  static const reportButtonKey = Key('item.report');

  final PublishedSite site;
  final SiteObject? object;
  final SiteRisk? risk;
  final SiteZone? zone;
  final bool fromPlan;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final object = this.object;
    final risk = this.risk;
    final zone = this.zone;

    final (
      String title,
      String subtitle,
      Color color,
      IconData icon,
    ) = switch ((object, risk, zone)) {
      (final SiteObject o, _, _) => (
        o.title,
        o.typeName,
        objectCategoryColors[o.category] ?? BrandColors.navy,
        Icons.place,
      ),
      (_, final SiteRisk r, _) => (
        r.title,
        r.typeName,
        severityColor(r.severity),
        Icons.warning_amber_rounded,
      ),
      (_, _, final SiteZone z) => (
        z.name,
        zoneTypeLabels[z.zoneType] ?? z.zoneType,
        zoneTypeColors[z.zoneType] ?? BrandColors.textMuted,
        Icons.crop_square,
      ),
      _ => ('Élément', '', BrandColors.textMuted, Icons.help_outline),
    };
    final placement = object?.placement ?? risk?.placement ?? zone?.placement;
    final plan = placement == null
        ? null
        : site.plans
              .where(
                (candidate) => candidate.revisionId == placement.planRevisionId,
              )
              .firstOrNull;
    final location = object != null
        ? site.locationOf(
            buildingId: object.buildingId,
            levelId: object.levelId,
            zoneId: object.zoneId,
          )
        : risk != null
        ? site.locationOf(
            buildingId: risk.buildingId,
            levelId: risk.levelId,
            zoneId: risk.zoneId,
          )
        : zone == null
        ? null
        : site.locationOf(levelId: zone.levelId);
    final fields = object != null
        ? site.objectFields[object.typeCode] ?? const {}
        : risk != null
        ? site.riskFields[risk.typeCode] ?? const {}
        : const <String, FieldDefinition>{};
    final properties = object?.properties ?? risk?.properties ?? const {};

    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 150,
            child: Text(
              label,
              style: textTheme.bodyMedium?.copyWith(
                color: BrandColors.textMuted,
              ),
            ),
          ),
          Expanded(child: SelectableText(value, style: textTheme.bodyLarge)),
        ],
      ),
    );

    return ListView(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 36),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: textTheme.titleLarge),
                  if (subtitle.isNotEmpty && subtitle != title)
                    Text(subtitle, style: textTheme.bodyMedium),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (object != null)
              _Badge(
                criticalityLabels[object.criticality] ?? object.criticality,
                criticalityColor(object.criticality),
              ),
            if (object != null && object.status != 'active')
              _Badge(
                objectStatusLabels[object.status] ?? object.status,
                BrandColors.critical,
              ),
            if (risk != null)
              _Badge(
                'Gravité ${risk.severity} · ${severityLabels[risk.severity]}',
                severityColor(risk.severity),
              ),
          ],
        ),
        if (object?.instructions ?? risk?.description case final text?) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: BrandColors.background,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: BrandColors.border),
            ),
            child: Text(text, style: textTheme.bodyLarge),
          ),
        ],
        if (object != null && object.photos.isNotEmpty) ...[
          const SizedBox(height: 12),
          PhotoStrip(object: object),
        ],
        const SizedBox(height: 12),
        if (location != null) row('Emplacement', location),
        if (risk?.quantity case final quantity?)
          row(
            'Quantité',
            [
              quantity == quantity.roundToDouble()
                  ? quantity.toInt().toString()
                  : quantity.toString().replaceAll('.', ','),
              risk!.unit,
            ].nonNulls.join(' '),
          ),
        for (final MapEntry(:key, :value) in properties.entries)
          row(
            fields[key]?.title ?? key,
            fields[key]?.format(value) ?? '$value',
          ),
        if (object?.location case (final lon, final lat))
          row(
            'Position GPS',
            '${lat.toStringAsFixed(5)}, ${lon.toStringAsFixed(5)}',
          ),
        if (object?.verifiedAt case final verified?)
          row('Vérifié le', formatDateFr(verified)),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          key: ItemSheet.reportButtonKey,
          onPressed: () {
            final (type, id) = object != null
                ? ('object', object.id)
                : risk != null
                ? ('risk', risk.id)
                : ('zone', zone!.id);
            Navigator.of(context).pop();
            unawaited(
              context.push<void>(
                AppRoutes.report(site.siteId, itemType: type, itemId: id),
              ),
            );
          },
          icon: const Icon(Icons.flag_outlined),
          label: const Text('Signaler un écart'),
        ),
        if (plan != null && !fromPlan) ...[
          const SizedBox(height: 16),
          FilledButton.icon(
            key: ItemSheet.planButtonKey,
            onPressed: () {
              Navigator.of(context).pop();
              unawaited(
                context.push<void>(
                  AppRoutes.plan(
                    site.siteId,
                    plan.id,
                    focus: object?.id ?? risk?.id ?? zone?.id,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.map_outlined),
            label: Text('Voir sur le plan « ${plan.title} »'),
          ),
        ],
      ],
    );
  }
}

/// Photos d'un point (PLAN-05), lues dans la base chiffrée ; un appui
/// ouvre la photo en plein écran, avec zoom.
class PhotoStrip extends ConsumerWidget {
  const PhotoStrip({required this.object, super.key});

  static Key thumbnailKey(String photoId) => Key('item.photo.$photoId');

  final SiteObject object;

  @override
  Widget build(BuildContext context, WidgetRef ref) => SizedBox(
    height: 148,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: object.photos.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8),
      itemBuilder: (context, index) {
        final photo = object.photos[index];
        final caption = photo.caption ?? 'Photo ${index + 1}';
        final file = ref.watch(installedFileProvider(photo.assetSha256));
        return Semantics(
          button: true,
          label: caption,
          excludeSemantics: true,
          child: InkWell(
            key: thumbnailKey(photo.id),
            borderRadius: BorderRadius.circular(8),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => DocumentScreen(
                  title: object.title,
                  sha256: photo.assetSha256,
                  mimeType: photo.mimeType,
                  caption: caption,
                ),
              ),
            ),
            child: SizedBox(
              width: 160,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: 160,
                        child: switch (file) {
                          AsyncData(value: final bytes?) => Image.memory(
                            bytes,
                            fit: BoxFit.cover,
                            cacheWidth: 480,
                            errorBuilder: (_, _, _) =>
                                const _PhotoPlaceholder(),
                          ),
                          AsyncLoading() => const ColoredBox(
                            color: BrandColors.background,
                          ),
                          _ => const _PhotoPlaceholder(),
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );
}

class _PhotoPlaceholder extends StatelessWidget {
  const _PhotoPlaceholder();

  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: BrandColors.background,
    child: Center(
      child: Icon(
        Icons.image_not_supported_outlined,
        color: BrandColors.textMuted,
      ),
    ),
  );
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.color);

  final String text;
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
      text,
      style: Theme.of(context).textTheme.labelLarge
          ?.copyWith(color: color, fontWeight: FontWeight.w700),
    ),
  );
}
