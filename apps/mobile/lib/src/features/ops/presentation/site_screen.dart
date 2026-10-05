import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/ops_scaffold.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Synthèse opérationnelle d'un site (OPS-01, maquette écran 07) : les
/// points critiques d'emblée, puis six grandes entrées et les autres
/// sections du registre (ADR-026). Données de la dernière version publiée
/// installée, avec son âge (OPS-05).
class SiteScreen extends ConsumerWidget {
  const SiteScreen({required this.siteId, super.key});

  final String siteId;

  static Key tileKey(OpsSection section) => Key('site.tile.${section.name}');
  static const reportButtonKey = Key('site.report');
  static const etarePdfKey = Key('site.etarePdf');

  @override
  Widget build(BuildContext context, WidgetRef ref) => OpsScaffold(
    siteId: siteId,
    title: (site) => site.name,
    builder: (context, site) => _Synthesis(site: site),
  );
}

class _Synthesis extends StatelessWidget {
  const _Synthesis({required this.site});

  final PublishedSite site;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final critical = site.risks.where((risk) => risk.critical).toList();
    final outOfService = site.objects.where((object) => object.outOfService);
    // Points critiques, comme dans l'aperçu et le PDF (ceux hors service sont déjà signalés).
    final criticalObjects = site.criticalObjects.where(
      (object) => !object.outOfService,
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Identity(site: site),
        const SizedBox(height: 12),
        if (outOfService.isNotEmpty)
          for (final object in outOfService)
            _Alert(
              icon: Icons.block,
              color: BrandColors.critical,
              text: '${object.title} : HORS SERVICE',
              onTap: () => showItemSheet(context, site, object: object),
            ),
        for (final risk in critical)
          _Alert(
            icon: Icons.warning_amber_rounded,
            color: severityColor(risk.severity),
            text:
                '${risk.title} · gravité ${severityLabels[risk.severity]?.toLowerCase()}',
            onTap: () => showItemSheet(context, site, risk: risk),
          ),
        for (final object in criticalObjects)
          _Alert(
            icon: Icons.priority_high,
            color: BrandColors.critical,
            text: '${object.title} · critique',
            onTap: () => showItemSheet(context, site, object: object),
          ),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, constraints) => GridView.count(
            crossAxisCount: constraints.maxWidth >= 600 ? 3 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              for (final section in OpsSection.tiles)
                if (site.shows(section))
                  _SectionTile(
                    key: SiteScreen.tileKey(section),
                    section: section,
                    count: site.countOf(section),
                    onTap: () => context.push(
                      AppRoutes.section(site.siteId, section.name),
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _EtarePdfTile(site: site),
        for (final section in OpsSection.others)
          if (site.shows(section) && site.countOf(section) > 0)
            ListTile(
              key: SiteScreen.tileKey(section),
              leading: Icon(section.icon),
              title: Text('${section.label} (${site.countOf(section)})'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  context.push(AppRoutes.section(site.siteId, section.name)),
            ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: SiteScreen.reportButtonKey,
          onPressed: () => context.push(AppRoutes.report(site.siteId)),
          icon: const Icon(Icons.flag_outlined),
          label: const Text('Signaler un écart sur ce site'),
        ),
        const Divider(height: 32),
        Text(
          [
            if (site.lastVerifiedAt case final verified?)
              'Dernière vérification : ${formatDateFr(verified)}',
            if (site.approvedBy case final approver?)
              site.approvedAt == null
                  ? 'Validée par $approver'
                  : 'Validée par $approver le ${formatDateFr(site.approvedAt!)}',
            'Données publiées par la Prévision, consultées hors ligne.',
          ].join('\n'),
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
      ],
    );
  }
}

/// Dossier ETARE publié (PDF), installé avec la version.
class _EtarePdfTile extends ConsumerWidget {
  const _EtarePdfTile({required this.site});

  final PublishedSite site;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sha256 = ref.watch(etarePdfProvider(site.siteId)).value;
    if (sha256 == null) return const SizedBox.shrink();
    return ListTile(
      key: SiteScreen.etarePdfKey,
      leading: const Icon(Icons.picture_as_pdf_outlined),
      title: const Text('Dossier ETARE (PDF)'),
      subtitle: Text(
        'Version publiée n° ${site.publicationNumber}, lisible sans réseau',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => DocumentScreen(
            title: 'ETARE · ${site.name}',
            sha256: sha256,
            mimeType: 'application/pdf',
          ),
        ),
      ),
    );
  }
}

class _Identity extends StatelessWidget {
  const _Identity({required this.site});

  final PublishedSite site;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final address = site.address;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          [
            if (site.etareNumber != null) 'ETARE ${site.etareNumber}',
            'version ${site.publicationNumber}',
            if (site.publishedAt != null)
              'publiée le ${formatDateFr(site.publishedAt!)}',
            'hors ligne ✓',
          ].join(' • '),
          style: textTheme.titleSmall?.copyWith(color: BrandColors.textMuted),
        ),
        if (address != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              addressLine(address.label, address.city),
              style: textTheme.bodyLarge,
            ),
          ),
        if (site.location case (final lon, final lat))
          SelectableText(
            'GPS ${lat.toStringAsFixed(5)}, ${lon.toStringAsFixed(5)}',
            style: textTheme.bodyMedium,
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Chip(label: Text(siteTypeLabels[site.siteType] ?? site.siteType)),
            for (final classification in site.classifications)
              Chip(label: Text(classification.shortLabel)),
          ],
        ),
      ],
    );
  }
}

class _Alert extends StatelessWidget {
  const _Alert({
    required this.icon,
    required this.color,
    required this.text,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    color: color.withValues(alpha: 0.08),
    shape: RoundedRectangleBorder(
      side: BorderSide(color: color),
      borderRadius: BorderRadius.circular(12),
    ),
    child: ListTile(
      leading: Icon(icon, color: color, size: 32),
      title: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium
            ?.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
      onTap: onTap,
    ),
  );
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({
    required this.section,
    required this.count,
    required this.onTap,
    super.key,
  });

  final OpsSection section;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final color = section == OpsSection.risks && count > 0
        ? BrandColors.critical
        : BrandColors.navy;
    return Semantics(
      button: true,
      label: '${section.label}, $count',
      excludeSemantics: true,
      child: Material(
        color: BrandColors.surface,
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: BrandColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(section.icon, size: 36, color: color),
                const SizedBox(height: 6),
                Text(
                  section.label.toUpperCase(),
                  style: textTheme.titleMedium?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text('$count', style: textTheme.titleLarge),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
