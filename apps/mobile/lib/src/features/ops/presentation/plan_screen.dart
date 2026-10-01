import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/plan_items.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/ops_scaffold.dart';
import 'package:flutter/foundation.dart' show setEquals;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Plan tactile (OPS-02, maquette écran 08) : zoom et déplacement aux
/// doigts, calques filtrables, fiche d'un élément au toucher.
class PlanScreen extends ConsumerWidget {
  const PlanScreen({
    required this.siteId,
    required this.planId,
    this.focusId,
    super.key,
  });

  final String siteId;
  final String planId;

  /// Élément sur lequel centrer le plan à l'ouverture.
  final String? focusId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => OpsScaffold(
    siteId: siteId,
    title: (site) =>
        site.plans.where((plan) => plan.id == planId).firstOrNull?.title ??
        'Plan',
    builder: (context, site) {
      final plan = site.plans.where((p) => p.id == planId).firstOrNull;
      if (plan == null) {
        return const Center(child: Text('Plan absent de la version publiée.'));
      }
      final image = ref.watch(installedFileProvider(plan.assetSha256));
      return switch (image) {
        AsyncData(value: final bytes?) => PlanView(
          site: site,
          plan: plan,
          image: bytes,
          focusId: focusId,
        ),
        AsyncData() => const Center(
          child: Text('Fond de plan non installé : synchronisez la tablette.'),
        ),
        AsyncError() => const Center(child: Text('Fond de plan illisible.')),
        _ => const Center(child: CircularProgressIndicator()),
      };
    },
  );
}

class PlanView extends StatefulWidget {
  const PlanView({
    required this.site,
    required this.plan,
    required this.image,
    this.focusId,
    super.key,
  });

  static Key layerKey(PlanLayer layer) => Key('plan.layer.${layer.name}');
  static const canvasKey = Key('plan.canvas');

  final PublishedSite site;
  final SitePlan plan;
  final Uint8List image;
  final String? focusId;

  @override
  State<PlanView> createState() => _PlanViewState();
}

class _PlanViewState extends State<PlanView> {
  final _transform = TransformationController();
  late final List<PlanItem> _items = planItems(widget.site, widget.plan);
  final Set<PlanLayer> _visible = {...PlanLayer.values};
  Size? _viewport;
  double _scale = 1;

  @override
  void initState() {
    super.initState();
    _transform.addListener(_onTransform);
  }

  @override
  void dispose() {
    _transform
      ..removeListener(_onTransform)
      ..dispose();
    super.dispose();
  }

  /// Zoom courant, lu sur l'axe X (getMaxScaleOnAxis inclurait l'axe Z, qui
  /// reste à 1 : un plan réduit paraîtrait à 100 %).
  static double _scaleOf(Matrix4 matrix) => math.sqrt(
    matrix.storage[0] * matrix.storage[0] +
        matrix.storage[1] * matrix.storage[1],
  );

  void _onTransform() {
    final scale = _scaleOf(_transform.value);
    if ((scale - _scale).abs() > 0.001) setState(() => _scale = scale);
  }

  double _fitScale(Size viewport) => math.min(
    viewport.width / widget.plan.width,
    viewport.height / widget.plan.height,
  );

  /// Plan entier à l'écran, ou centré et agrandi sur l'élément demandé.
  void _initialTransform(Size viewport) {
    final fit = _fitScale(viewport);
    final focus = _items.where((item) => item.id == widget.focusId).firstOrNull;
    final scale = focus == null ? fit : fit * 3;
    final (cx, cy) = focus == null
        ? (widget.plan.width / 2, widget.plan.height / 2)
        : centerOf(focus.geometry);
    // Échelle connue AVANT la mise à jour : pas de reconstruction pendant build.
    _scale = scale;
    _transform.value = Matrix4.identity()
      ..translateByDouble(
        viewport.width / 2 - cx * scale,
        viewport.height / 2 - cy * scale,
        0,
        1,
      )
      ..scaleByDouble(scale, scale, 1, 1);
  }

  /// Appui long : signaler un écart à cet endroit du plan (et sur l'élément
  /// touché, s'il y en a un).
  void _onLongPress(LongPressStartDetails details) {
    final position = details.localPosition;
    final hit = hitTest(
      _items,
      (position.dx, position.dy),
      24 / _scale,
      _visible,
    );
    final (String? type, String? id) = switch (hit) {
      ObjectItem(:final object) => ('object', object.id),
      RiskItem(:final risk) => ('risk', risk.id),
      ZoneItem(:final zone) => ('zone', zone.id),
      null => (null, null),
    };
    unawaited(
      context.push<void>(
        AppRoutes.report(
          widget.site.siteId,
          itemType: type,
          itemId: id,
          planRevisionId: widget.plan.revisionId,
          x: position.dx.clamp(0, widget.plan.width).toDouble(),
          y: position.dy.clamp(0, widget.plan.height).toDouble(),
        ),
      ),
    );
  }

  void _onTap(TapUpDetails details) {
    final position = details.localPosition;
    // Tolérance constante à l'écran (≈ 24 dp), quel que soit le zoom.
    final hit = hitTest(
      _items,
      (position.dx, position.dy),
      24 / _scale,
      _visible,
    );
    if (hit == null) return;
    unawaited(
      showItemSheet(
        context,
        widget.site,
        object: hit is ObjectItem ? hit.object : null,
        risk: hit is RiskItem ? hit.risk : null,
        zone: hit is ZoneItem ? hit.zone : null,
        fromPlan: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final counts = {
      for (final layer in PlanLayer.values)
        layer: _items.where((item) => item.layer == layer).length,
    };
    return Column(
      children: [
        SizedBox(
          height: 56,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            children: [
              for (final layer in PlanLayer.values)
                if (counts[layer]! > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: FilterChip(
                      key: PlanView.layerKey(layer),
                      label: Text('${layer.label} (${counts[layer]})'),
                      selected: _visible.contains(layer),
                      onSelected: (selected) => setState(
                        () => selected
                            ? _visible.add(layer)
                            : _visible.remove(layer),
                      ),
                    ),
                  ),
            ],
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final viewport = constraints.biggest;
              if (_viewport != viewport) {
                _viewport = viewport;
                _initialTransform(viewport);
              }
              final fit = _fitScale(viewport);
              return ClipRect(
                child: InteractiveViewer(
                  transformationController: _transform,
                  constrained: false,
                  minScale: fit * 0.8,
                  maxScale: fit * 16,
                  boundaryMargin: EdgeInsets.all(
                    math.max(widget.plan.width, widget.plan.height) / 2,
                  ),
                  child: GestureDetector(
                    key: PlanView.canvasKey,
                    onTapUp: _onTap,
                    onLongPressStart: _onLongPress,
                    child: SizedBox(
                      width: widget.plan.width,
                      height: widget.plan.height,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.memory(
                            widget.image,
                            fit: BoxFit.fill,
                            gaplessPlayback: true,
                            filterQuality: FilterQuality.medium,
                          ),
                          CustomPaint(
                            painter: PlanOverlayPainter(
                              items: _items,
                              visible: Set.of(_visible),
                              scale: _scale,
                              focusId: widget.focusId,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Dessin des zones, points et risques par-dessus le fond, en pixels du fond.
/// Tailles des symboles constantes à l'écran (divisées par le zoom).
class PlanOverlayPainter extends CustomPainter {
  PlanOverlayPainter({
    required this.items,
    required this.visible,
    required this.scale,
    this.focusId,
  });

  final List<PlanItem> items;
  final Set<PlanLayer> visible;
  final double scale;
  final String? focusId;

  Offset _offset((double, double) point) => Offset(point.$1, point.$2);

  Path _path(List<(double, double)> points, {required bool close}) {
    final path = Path();
    if (points.isEmpty) return path;
    path.moveTo(points.first.$1, points.first.$2);
    for (final (x, y) in points.skip(1)) {
      path.lineTo(x, y);
    }
    if (close) path.close();
    return path;
  }

  void _label(Canvas canvas, String text, Offset at, Color color) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 13 / scale,
          fontWeight: FontWeight.w700,
          shadows: const [Shadow(color: Colors.white, blurRadius: 3)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, at - Offset(painter.width / 2, painter.height / 2));
  }

  double _screenWidth(PlanGeometry geometry) {
    final xs = geometry.points.map((point) => point.$1);
    return xs.isEmpty ? 0 : (xs.reduce(math.max) - xs.reduce(math.min)) * scale;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = 2 / scale;
    final radius = 14 / scale;
    for (final item in items) {
      if (!visible.contains(item.layer)) continue;
      final geometry = item.geometry;
      final color = switch (item) {
        RiskItem() => riskColor,
        ObjectItem(:final object) =>
          object.outOfService
              ? BrandColors.critical
              : objectCategoryColors[object.category] ?? BrandColors.navy,
        ZoneItem(:final zone) =>
          zoneTypeColors[zone.zoneType] ?? const Color(0xFF334155),
      };
      final fill = Paint()
        ..color = color.withValues(alpha: item is ZoneItem ? 0.12 : 0.22);
      final line = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = item is ZoneItem ? stroke : stroke * 2;

      switch (geometry.type) {
        case 'Polygon':
          final path = _path(geometry.points, close: true);
          canvas
            ..drawPath(path, fill)
            ..drawPath(path, line);
          // Nom d'une zone seulement si elle est assez large à l'écran.
          if (item is ZoneItem && _screenWidth(geometry) >= 96) {
            _label(canvas, item.zone.name, _offset(centerOf(geometry)), color);
          }
        case 'LineString':
          canvas.drawPath(_path(geometry.points, close: false), line);
        default:
          final center = _offset(geometry.points.first);
          if (item is RiskItem) {
            final diamond = Path()
              ..moveTo(center.dx, center.dy - radius * 1.2)
              ..lineTo(center.dx + radius * 1.2, center.dy)
              ..lineTo(center.dx, center.dy + radius * 1.2)
              ..lineTo(center.dx - radius * 1.2, center.dy)
              ..close();
            canvas
              ..drawPath(diamond, Paint()..color = Colors.white)
              ..drawPath(diamond, line);
            _label(canvas, '!', center, color);
          } else if (item is ObjectItem) {
            canvas
              ..drawCircle(center, radius, Paint()..color = color)
              ..drawCircle(
                center,
                radius,
                Paint()
                  ..color = Colors.white
                  ..style = PaintingStyle.stroke
                  ..strokeWidth = stroke,
              );
            final text = item.object.label ?? item.object.typeName;
            _label(
              canvas,
              text.length > 3 ? text.substring(0, 3) : text,
              center,
              Colors.white,
            );
          }
      }
      if (item.id == focusId) {
        canvas.drawCircle(
          _offset(centerOf(geometry)),
          radius * 2,
          Paint()
            ..color = const Color(0xFFFACC15)
            ..style = PaintingStyle.stroke
            ..strokeWidth = stroke * 2,
        );
      }
    }
  }

  @override
  bool shouldRepaint(PlanOverlayPainter oldDelegate) =>
      oldDelegate.scale != scale ||
      oldDelegate.focusId != focusId ||
      !setEquals(oldDelegate.visible, visible) ||
      oldDelegate.items != items;
}
