import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/ops_scaffold.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/reports/data/photo_picker.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Signalement d'un écart (OPS-04, maquette écran 09) : enregistré sur la
/// tablette, chiffré, même sans réseau ; transmis à la Prévision dès que
/// possible. Il n'altère jamais la fiche officielle.
class ReportFormScreen extends StatelessWidget {
  const ReportFormScreen({
    required this.siteId,
    this.itemType,
    this.itemId,
    this.planRevisionId,
    this.planX,
    this.planY,
    super.key,
  });

  static const descriptionKey = Key('report.description');
  static const saveKey = Key('report.save');
  static const cameraKey = Key('report.camera');
  static const galleryKey = Key('report.gallery');
  static Key categoryKey(ReportCategory category) =>
      Key('report.category.${category.wire}');
  static Key severityKey(ReportSeverity severity) =>
      Key('report.severity.${severity.wire}');

  final String siteId;
  final String? itemType;
  final String? itemId;
  final String? planRevisionId;
  final double? planX;
  final double? planY;

  @override
  Widget build(BuildContext context) => OpsScaffold(
    siteId: siteId,
    title: (_) => 'Signaler un écart',
    builder: (context, site) => _ReportForm(
      site: site,
      item: _item(site),
      plan: planRevisionId == null || planX == null || planY == null
          ? null
          : site.plans
                .where((plan) => plan.revisionId == planRevisionId)
                .firstOrNull,
      planX: planX,
      planY: planY,
    ),
  );

  /// Élément désigné, tel qu'il figure dans la version consultée.
  _Item? _item(PublishedSite site) {
    final id = itemId;
    if (id == null) return null;
    return switch (itemType) {
      'object' =>
        site.objects
            .where((o) => o.id == id)
            .map((o) => _Item('object', o.id, o.title, o.category))
            .firstOrNull,
      'risk' =>
        site.risks
            .where((r) => r.id == id)
            .map((r) => _Item('risk', r.id, r.title, 'risk'))
            .firstOrNull,
      'zone' =>
        site.zones
            .where((z) => z.id == id)
            .map((z) => _Item('zone', z.id, z.name, null))
            .firstOrNull,
      _ => null,
    };
  }
}

class _Item {
  const _Item(this.type, this.id, this.label, this.category);

  final String type;
  final String id;
  final String label;
  final String? category;

  /// Catégorie proposée d'après l'élément visé.
  ReportCategory get suggestedCategory => switch (category) {
    'water' => ReportCategory.water,
    'risk' => ReportCategory.risk,
    'access' => ReportCategory.access,
    _ => ReportCategory.access,
  };
}

class _ReportForm extends ConsumerStatefulWidget {
  const _ReportForm({
    required this.site,
    required this.item,
    required this.plan,
    required this.planX,
    required this.planY,
  });

  final PublishedSite site;
  final _Item? item;
  final SitePlan? plan;
  final double? planX;
  final double? planY;

  @override
  ConsumerState<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends ConsumerState<_ReportForm> {
  final _description = TextEditingController();
  late ReportCategory _category =
      widget.item?.suggestedCategory ?? ReportCategory.access;
  ReportSeverity _severity = ReportSeverity.important;
  final List<NewReportPhoto> _photos = [];
  late _Item? _item = widget.item;
  late bool _withPosition = widget.plan != null;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _addPhoto(PhotoSource source) async {
    setState(() => _error = null);
    try {
      final photo = await ref
          .read(photoPickerProvider)
          .pick(source, position: _photos.length);
      if (photo != null && mounted) setState(() => _photos.add(photo));
    } on PhotoRefused catch (refusal) {
      setState(() => _error = refusal.message);
    } on Object catch (error) {
      setState(() => _error = 'Photo indisponible : ${describeError(error)}');
    }
  }

  Future<void> _save() async {
    if (_description.text.trim().isEmpty) {
      setState(() => _error = 'Décrivez le constat.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final plan = _withPosition ? widget.plan : null;
    try {
      await ref
          .read(reportOutboxProvider.notifier)
          .save(
            ReportDraft(
              siteId: widget.site.siteId,
              siteName: widget.site.name,
              publicationId: widget.site.publicationId,
              publicationNumber: widget.site.publicationNumber,
              category: _category,
              severity: _severity,
              description: _description.text,
              photos: List.of(_photos),
              itemType: _item?.type,
              itemId: _item?.id,
              itemLabel: _item?.label,
              planRevisionId: plan?.revisionId,
              planTitle: plan?.title,
              planX: plan == null ? null : widget.planX,
              planY: plan == null ? null : widget.planY,
            ),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Signalement enregistré : il sera transmis dès que possible.',
          ),
        ),
      );
      context.pop();
    } on Object catch (error) {
      setState(() => _error = describeError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final item = _item;
    final plan = widget.plan;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          '${widget.site.name} • version ${widget.site.publicationNumber}',
          style: textTheme.titleMedium,
        ),
        Text(
          'Un signalement n’altère jamais la fiche officielle : il crée une '
          'tâche de vérification pour le service Prévision.',
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
        if (item != null)
          _Attachment(
            icon: Icons.place_outlined,
            text: 'Élément : ${item.label}',
            onRemove: () => setState(() => _item = null),
          ),
        if (plan != null && _withPosition)
          _Attachment(
            icon: Icons.my_location,
            text: 'Position sur le plan « ${plan.title} » jointe',
            onRemove: () => setState(() => _withPosition = false),
          ),
        const SizedBox(height: 16),
        Text('Catégorie', style: textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final category in ReportCategory.values)
              ChoiceChip(
                key: ReportFormScreen.categoryKey(category),
                avatar: Icon(category.icon, size: 20),
                label: Text(category.label),
                selected: _category == category,
                onSelected: (_) => setState(() => _category = category),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text('Importance', style: textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final severity in ReportSeverity.values)
              ChoiceChip(
                key: ReportFormScreen.severityKey(severity),
                label: Text(severity.label),
                selected: _severity == severity,
                selectedColor: severity == ReportSeverity.urgent
                    ? BrandColors.critical.withValues(alpha: 0.2)
                    : null,
                onSelected: (_) => setState(() => _severity = severity),
              ),
          ],
        ),
        const SizedBox(height: 16),
        TextField(
          key: ReportFormScreen.descriptionKey,
          controller: _description,
          enabled: !_busy,
          minLines: 3,
          maxLines: 8,
          maxLength: maxReportDescription,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Description du constat',
            hintText:
                'Ex. portail secondaire condamné, accès engin impossible.',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Photos (${_photos.length}/$maxReportPhotos)',
          style: textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        if (_photos.isNotEmpty)
          SizedBox(
            height: 112,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _photos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      _photos[index].content,
                      width: 140,
                      height: 112,
                      fit: BoxFit.cover,
                      cacheWidth: 420,
                    ),
                  ),
                  Positioned(
                    top: 0,
                    right: 0,
                    child: IconButton.filledTonal(
                      tooltip: 'Retirer la photo',
                      onPressed: _busy
                          ? null
                          : () => setState(() => _photos.removeAt(index)),
                      icon: const Icon(Icons.close),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (_photos.length < maxReportPhotos)
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                key: ReportFormScreen.cameraKey,
                onPressed: _busy ? null : () => _addPhoto(PhotoSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Prendre une photo'),
              ),
              OutlinedButton.icon(
                key: ReportFormScreen.galleryKey,
                onPressed: _busy ? null : () => _addPhoto(PhotoSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Galerie'),
              ),
            ],
          ),
        if (_error case final error?) ...[
          const SizedBox(height: 12),
          Text(
            error,
            style: textTheme.bodyLarge?.copyWith(color: BrandColors.critical),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          key: ReportFormScreen.saveKey,
          onPressed: _busy ? null : _save,
          icon: const Icon(Icons.flag_outlined),
          label: const Text('Enregistrer le signalement'),
        ),
        const SizedBox(height: 8),
        Text(
          'Conservé chiffré sur la tablette, envoi automatique lors de la '
          'prochaine connexion.',
          textAlign: TextAlign.center,
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
      ],
    );
  }
}

class _Attachment extends StatelessWidget {
  const _Attachment({
    required this.icon,
    required this.text,
    required this.onRemove,
  });

  final IconData icon;
  final String text;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(top: 12),
    child: ListTile(
      leading: Icon(icon, color: BrandColors.navy),
      title: Text(text),
      trailing: IconButton(
        tooltip: 'Retirer',
        onPressed: onRemove,
        icon: const Icon(Icons.close),
      ),
    ),
  );
}
