import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/core/theme/ui_kit.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
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
  static const mapKey = Key('site.map');

  @override
  Widget build(BuildContext context, WidgetRef ref) => OpsScaffold(
    siteId: siteId,
    title: (site) => site.name,
    builder: (context, site) => _Synthesis(site: site),
  );
}

class _Synthesis extends ConsumerWidget {
  const _Synthesis({required this.site});

  final PublishedSite site;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final critical = site.risks.where((risk) => risk.critical).toList();
    final outOfService = site.objects.where((object) => object.outOfService);
    // Points critiques, comme dans l'aperçu et le PDF (ceux hors service sont déjà signalés).
    final criticalObjects = site.criticalObjects.where(
      (object) => !object.outOfService,
    );
    final others = [
      for (final section in OpsSection.others)
        if (site.shows(section) && site.countOf(section) > 0) section,
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Identity(site: site, now: ref.watch(clockProvider)()),
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
        const SizedBox(height: 4),
        LayoutBuilder(
          builder: (context, constraints) => GridView.count(
            crossAxisCount: constraints.maxWidth >= 600 ? 3 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.6,
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
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              _EtarePdfTile(site: site),
              if (site.location != null)
                OpsRow(
                  key: SiteScreen.mapKey,
                  leading: const PictoBox(icon: Icons.map_outlined),
                  title: 'Situer sur la carte',
                  subtitle: 'Fond hors ligne du secteur, points extérieurs',
                  onTap: () => context.push(AppRoutes.map(siteId: site.siteId)),
                ),
              for (final section in others) ...[
                const Divider(height: 1),
                OpsRow(
                  key: SiteScreen.tileKey(section),
                  leading: PictoBox(icon: section.icon),
                  title: '${section.label} (${site.countOf(section)})',
                  onTap: () => context.push(
                    AppRoutes.section(site.siteId, section.name),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          key: SiteScreen.reportButtonKey,
          onPressed: () => context.push(AppRoutes.report(site.siteId)),
          icon: const Icon(Icons.flag_outlined),
          label: const Text('Signaler un écart sur ce site'),
        ),
        const SizedBox(height: 20),
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
    return Column(
      children: [
        OpsRow(
          key: SiteScreen.etarePdfKey,
          leading: const PictoBox(icon: Icons.picture_as_pdf_outlined),
          title: 'Dossier ETARE (PDF)',
          subtitle:
              'Version publiée n° ${site.publicationNumber}, lisible sans réseau',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => DocumentScreen(
                title: 'ETARE · ${site.name}',
                sha256: sha256,
                mimeType: 'application/pdf',
              ),
            ),
          ),
        ),
        if (site.location != null) const Divider(height: 1),
      ],
    );
  }
}

/// Identité de la version installée : pictogramme du type, adresse, GPS,
/// badges de version et de classement.
class _Identity extends StatelessWidget {
  const _Identity({required this.site, required this.now});

  final PublishedSite site;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final address = site.address;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PictoBox(
              icon: siteTypeIcon(site.siteType),
              size: 56,
              color: BrandColors.onDark,
              background: BrandColors.navy,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    [
                      if (site.etareNumber != null) 'ETARE ${site.etareNumber}',
                      'version ${site.publicationNumber}',
                      if (site.publishedAt case final published?)
                        'publiée ${formatRelativeFr(published, now)}',
                    ].join(' · '),
                    style: textTheme.titleSmall?.copyWith(
                      color: BrandColors.textMuted,
                    ),
                  ),
                  if (address != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 3),
                            child: Icon(
                              Icons.place_outlined,
                              size: 18,
                              color: BrandColors.textMuted,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              addressLine(address.label, address.city),
                              style: textTheme.bodyLarge,
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (site.location case (final lon, final lat))
                    SelectableText(
                      'GPS ${lat.toStringAsFixed(5)}, ${lon.toStringAsFixed(5)}',
                      style: textTheme.bodyMedium?.copyWith(
                        color: BrandColors.textMuted,
                      ),
                    ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      const StatusBadge(
                        'Hors ligne',
                        tone: Tone.success,
                        icon: Icons.offline_pin_outlined,
                      ),
                      StatusBadge(
                        siteTypeLabels[site.siteType] ?? site.siteType,
                        tone: Tone.info,
                      ),
                      for (final classification in site.classifications)
                        StatusBadge(classification.shortLabel),
                    ],
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
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              PictoBox(
                icon: icon,
                color: BrandColors.onDark,
                background: color,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: color, fontWeight: FontWeight.w700),
                ),
              ),
              Icon(Icons.chevron_right, color: color),
            ],
          ),
        ),
      ),
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
    final alert = section == OpsSection.risks && count > 0;
    final tone = alert ? Tone.critical : Tone.navy;
    return Semantics(
      button: true,
      label: '${section.label}, $count',
      excludeSemantics: true,
      child: Material(
        color: BrandColors.surface,
        shape: RoundedRectangleBorder(
          side: BorderSide(
            color: alert ? BrandColors.critical : BrandColors.border,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    PictoBox(icon: section.icon, tone: tone, size: 40),
                    const Spacer(),
                    Text(
                      '$count',
                      style: textTheme.headlineMedium?.copyWith(
                        color: count == 0 ? BrandColors.textMuted : tone.color,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                  ],
                ),
                Text(
                  section.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.titleMedium?.copyWith(
                    color: alert ? BrandColors.critical : BrandColors.text,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
