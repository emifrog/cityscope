import 'dart:math' as math;

import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:flutter/foundation.dart';

/// Calques d'un plan (PLAN-04), identiques au back-office : chaque catégorie
/// de point appartient à un seul calque.
enum PlanLayer {
  risks('Risques'),
  water('Eau'),
  access('Accès'),
  energy('Énergie'),
  rescue('Secours'),
  annotations('Annotations'),
  zones('Zones');

  const PlanLayer(this.label);

  final String label;

  static PlanLayer ofCategory(String category) => switch (category) {
    'risk' => risks,
    'water' => water,
    'access' => access,
    'energy' => energy,
    'safety' ||
    'smoke_control' ||
    'refuge' ||
    'vertical' ||
    'communication' => rescue,
    _ => annotations,
  };
}

/// Élément dessiné sur un plan.
@immutable
sealed class PlanItem {
  const PlanItem();

  String get id;
  PlanLayer get layer;
  PlanGeometry get geometry;

  /// Ordre de priorité au toucher : un risque passe avant un point, un point
  /// avant une zone qui le contient.
  int get priority;
}

final class ObjectItem extends PlanItem {
  const ObjectItem(this.object, this.geometry);

  final SiteObject object;
  @override
  final PlanGeometry geometry;

  @override
  String get id => object.id;
  @override
  PlanLayer get layer => PlanLayer.ofCategory(object.category);
  @override
  int get priority => geometry.type == 'Point' ? 2 : 1;
}

final class RiskItem extends PlanItem {
  const RiskItem(this.risk, this.geometry);

  final SiteRisk risk;
  @override
  final PlanGeometry geometry;

  @override
  String get id => risk.id;
  @override
  PlanLayer get layer => PlanLayer.risks;
  @override
  int get priority => geometry.type == 'Point' ? 3 : 1;
}

final class ZoneItem extends PlanItem {
  const ZoneItem(this.zone, this.geometry);

  final SiteZone zone;
  @override
  final PlanGeometry geometry;

  @override
  String get id => zone.id;
  @override
  PlanLayer get layer => PlanLayer.zones;
  @override
  int get priority => 0;
}

/// Éléments placés sur le fond validé de ce plan, dans l'ordre de dessin
/// (zones dessous, risques dessus).
List<PlanItem> planItems(PublishedSite site, SitePlan plan) {
  bool onPlan(PlanPlacement? placement) =>
      placement != null && placement.planRevisionId == plan.revisionId;
  return [
    for (final zone in site.zones)
      if (onPlan(zone.placement)) ZoneItem(zone, zone.placement!.geometry),
    for (final object in site.objects)
      if (onPlan(object.placement))
        ObjectItem(object, object.placement!.geometry),
    for (final risk in site.risks)
      if (onPlan(risk.placement)) RiskItem(risk, risk.placement!.geometry),
  ];
}

/// Centre d'un élément (pour centrer le plan sur lui).
(double, double) centerOf(PlanGeometry geometry) {
  var points = geometry.points;
  if (points.isEmpty) return (0, 0);
  // Anneau fermé : le dernier sommet répète le premier.
  if (geometry.type == 'Polygon' &&
      points.length > 1 &&
      points.first == points.last) {
    points = points.sublist(0, points.length - 1);
  }
  var x = 0.0;
  var y = 0.0;
  for (final (px, py) in points) {
    x += px;
    y += py;
  }
  return (x / points.length, y / points.length);
}

double _distanceToSegment(
  (double, double) p,
  (double, double) a,
  (double, double) b,
) {
  final (px, py) = p;
  final (ax, ay) = a;
  final (bx, by) = b;
  final dx = bx - ax;
  final dy = by - ay;
  final length = dx * dx + dy * dy;
  final t = length == 0
      ? 0.0
      : (((px - ax) * dx + (py - ay) * dy) / length).clamp(0.0, 1.0);
  final cx = ax + t * dx;
  final cy = ay + t * dy;
  return math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

bool _inside((double, double) p, List<(double, double)> ring) {
  final (px, py) = p;
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final (xi, yi) = ring[i];
    final (xj, yj) = ring[j];
    if ((yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/// Distance d'un point (pixels du fond) à un élément ; 0 à l'intérieur d'une
/// surface.
double distanceTo(PlanItem item, (double, double) point) {
  final points = item.geometry.points;
  if (points.isEmpty) return double.infinity;
  switch (item.geometry.type) {
    case 'Point':
      return _distanceToSegment(point, points.first, points.first);
    case 'Polygon' when _inside(point, points):
      return 0;
    default:
      var best = double.infinity;
      for (var i = 0; i + 1 < points.length; i++) {
        best = math.min(
          best,
          _distanceToSegment(point, points[i], points[i + 1]),
        );
      }
      return best;
  }
}

/// Élément touché : le plus prioritaire à moins de [tolerance] pixels du fond.
PlanItem? hitTest(
  List<PlanItem> items,
  (double, double) point,
  double tolerance,
  Set<PlanLayer> visible,
) {
  PlanItem? best;
  var bestDistance = double.infinity;
  for (final item in items) {
    if (!visible.contains(item.layer)) continue;
    final distance = distanceTo(item, point);
    if (distance > tolerance) continue;
    final better =
        best == null ||
        item.priority > best.priority ||
        (item.priority == best.priority && distance < bestDistance);
    if (better) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}
