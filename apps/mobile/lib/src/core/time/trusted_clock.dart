import 'dart:async';

import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:flutter/foundation.dart';

/// Moment sûr : heure du serveur au dernier catalogue et lecture de l'horloge
/// monotone de la tablette à cet instant (SEC-05, ADR-029).
@immutable
final class TimeAnchor {
  const TimeAnchor({
    required this.serverTime,
    required this.elapsedMs,
    required this.bootCount,
  });

  final DateTime serverTime;
  final int elapsedMs;

  /// Nombre de démarrages de la tablette (-1 : inconnu).
  final int bootCount;
}

/// Persistance du repère et de la plus haute heure constatée.
abstract interface class TrustedTimeStore {
  Future<({TimeAnchor? anchor, DateTime? highWater})> load();

  /// Retient [at] s'il dépasse la plus haute heure constatée.
  Future<void> raiseHighWater(DateTime at);
}

/// Heure de confiance pour les contrôles locaux (verrouillage, autorisation
/// de consultation, sites sensibles), qu'un réglage de l'horloge ne prolonge
/// pas (SEC-05, architecture §19) :
/// - tant que la tablette n'a pas redémarré depuis le dernier catalogue,
///   l'heure se déduit du repère (heure du serveur + temps monotone écoulé),
///   sans lire l'horloge réglable ;
/// - après un redémarrage, ou sans horloge monotone, l'horloge de l'appareil
///   ne descend jamais sous la plus haute heure constatée ni l'heure du
///   dernier catalogue.
/// Une tablette compromise peut tout de même tricher : c'est une limite
/// connue, qui interdit de promettre une expiration inviolable hors réseau.
final class TrustedClock {
  TrustedClock({
    required this._platform,
    this._store,
    this._wall = DateTime.now,
  });

  final PlatformServices _platform;
  final TrustedTimeStore? _store;
  final DateTime Function() _wall;

  TimeAnchor? _anchor;
  DateTime? _highWater;
  MonotonicTime? _reading;
  final Stopwatch _sinceReading = Stopwatch();
  DateTime? _persistedHighWater;

  /// Lit le repère conservé et l'horloge monotone (démarrage, retour au
  /// premier plan, tâche de fond).
  Future<void> refresh() async {
    final stored = await _store?.load();
    if (stored != null) {
      _anchor = stored.anchor;
      _highWater = _later(_highWater, stored.highWater);
      _persistedHighWater = stored.highWater;
    }
    final reading = await _platform.monotonicTime();
    if (reading != null) {
      _reading = reading;
      _sinceReading
        ..reset()
        ..start();
    }
  }

  /// Un nouveau catalogue est reçu : son heure devient le repère.
  void anchorAt(TimeAnchor anchor) {
    _anchor = anchor;
    // L'heure du serveur remplace un plancher qu'une horloge avancée aurait poussé.
    _highWater = anchor.serverTime;
    _persistedHighWater = anchor.serverTime;
  }

  /// Lecture de l'horloge monotone pour un nouveau repère (null : indisponible).
  Future<MonotonicTime?> monotonic() => _platform.monotonicTime();

  /// Heure de confiance (UTC).
  DateTime now() {
    final anchor = _anchor;
    final reading = _reading;
    if (anchor != null &&
        reading != null &&
        anchor.bootCount >= 0 &&
        anchor.bootCount == reading.bootCount) {
      final elapsed = reading.elapsedMs + _sinceReading.elapsedMilliseconds;
      if (elapsed >= anchor.elapsedMs) {
        final trusted = anchor.serverTime.toUtc().add(
          Duration(milliseconds: elapsed - anchor.elapsedMs),
        );
        _highWater = _later(_highWater, trusted);
        return trusted;
      }
    }
    var trusted = _wall().toUtc();
    for (final floor in [_highWater, anchor?.serverTime]) {
      if (floor != null && floor.isAfter(trusted)) trusted = floor.toUtc();
    }
    _highWater = trusted;
    return trusted;
  }

  /// Conserve la plus haute heure constatée (au plus une écriture par minute).
  Future<void> persist() async {
    final store = _store;
    if (store == null) return;
    final current = now();
    final persisted = _persistedHighWater;
    if (persisted != null &&
        current.difference(persisted) < const Duration(minutes: 1)) {
      return;
    }
    _persistedHighWater = current;
    await store.raiseHighWater(current);
  }

  static DateTime? _later(DateTime? a, DateTime? b) {
    if (a == null) return b;
    if (b == null) return a;
    return b.isAfter(a) ? b : a;
  }
}
