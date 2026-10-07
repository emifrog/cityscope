import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/time/trusted_clock.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_platform.dart';

final class _MemoryStore implements TrustedTimeStore {
  TimeAnchor? anchor;
  DateTime? highWater;

  @override
  Future<({TimeAnchor? anchor, DateTime? highWater})> load() async =>
      (anchor: anchor, highWater: highWater);

  @override
  Future<void> raiseHighWater(DateTime at) async {
    final current = highWater;
    if (current == null || at.isAfter(current)) highWater = at;
  }
}

/// Égalité à la seconde près : l'horloge monotone avance entre deux lectures.
void expectAbout(DateTime actual, DateTime expected) =>
    expect(actual.difference(expected).inMilliseconds.abs(), lessThan(1000));

/// Heure de confiance (SEC-05) : une horloge réglée à la main ne prolonge ni
/// l'autorisation de consultation ni les sites sensibles.
void main() {
  final serverTime = DateTime.utc(2026, 10, 7, 8);
  late FakePlatformServices platform;
  late _MemoryStore store;
  late DateTime wall;
  late TrustedClock clock;

  setUp(() async {
    platform = FakePlatformServices();
    store = _MemoryStore()
      ..anchor = TimeAnchor(
        serverTime: serverTime,
        elapsedMs: platform.monotonic!.elapsedMs,
        bootCount: platform.monotonic!.bootCount,
      );
    wall = serverTime;
    clock = TrustedClock(platform: platform, store: store, wall: () => wall);
    await clock.refresh();
  });

  test('sans redémarrage, l’heure suit le repère du serveur : reculer ou '
      'avancer l’horloge n’y change rien', () async {
    platform.advance(const Duration(hours: 3));
    await clock.refresh();
    wall = serverTime.subtract(const Duration(days: 30));
    expectAbout(clock.now(), serverTime.add(const Duration(hours: 3)));
    wall = serverTime.add(const Duration(days: 30));
    expectAbout(clock.now(), serverTime.add(const Duration(hours: 3)));
  });

  test('après un redémarrage, l’horloge ne descend jamais sous la plus haute '
      'heure constatée', () async {
    platform.advance(const Duration(days: 2));
    await clock.refresh();
    expectAbout(clock.now(), serverTime.add(const Duration(days: 2)));
    await clock.persist();

    platform.reboot();
    final restarted = TrustedClock(
      platform: platform,
      store: store,
      wall: () => serverTime.subtract(const Duration(days: 10)),
    );
    await restarted.refresh();
    expectAbout(restarted.now(), serverTime.add(const Duration(days: 2)));
  });

  test('après un redémarrage, une horloge en avance est prise telle quelle : '
      'l’autorisation se termine plus tôt, jamais plus tard', () async {
    platform.reboot();
    await clock.refresh();
    wall = serverTime.add(const Duration(days: 9));
    expectAbout(clock.now(), serverTime.add(const Duration(days: 9)));
  });

  test('un nouveau catalogue remplace le plancher qu’une horloge avancée '
      'aurait poussé', () async {
    platform.reboot();
    await clock.refresh();
    wall = serverTime.add(const Duration(days: 9));
    clock.now();
    final reading = (await platform.monotonicTime())!;
    clock.anchorAt(
      TimeAnchor(
        serverTime: serverTime.add(const Duration(hours: 1)),
        elapsedMs: reading.elapsedMs,
        bootCount: reading.bootCount,
      ),
    );
    expectAbout(clock.now(), serverTime.add(const Duration(hours: 1)));
  });

  test('sans horloge monotone (autre plateforme), l’horloge de l’appareil '
      'reste bornée par l’heure du dernier catalogue', () async {
    final noMonotonic = TrustedClock(
      platform: const SoftwarePlatformServices(),
      store: store,
      wall: () => serverTime.subtract(const Duration(days: 3)),
    );
    await noMonotonic.refresh();
    expectAbout(noMonotonic.now(), serverTime);
  });
}
