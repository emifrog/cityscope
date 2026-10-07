import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final localCodeStoreProvider = Provider<LocalCodeStore>(
  (ref) => LocalCodeStore(ref.watch(secureStoreProvider)),
);

/// Temps monotone du processus pour l'inactivité au premier plan (l'écran
/// allumé, la tablette ne se met pas en veille) ; surchargé par les tests.
final monotonicClockProvider = Provider<Duration Function()>((ref) {
  final stopwatch = Stopwatch()..start();
  return () => stopwatch.elapsed;
});

/// Où en est le verrou applicatif (PER-02, SEC-05).
enum LockPhase {
  /// Personne n'est connecté : la connexion en ligne s'en charge.
  inactive,

  /// Lecture de l'état au démarrage : rien n'est montré.
  checking,

  /// Connecté sans code sur cette tablette : il faut en choisir un.
  setup,

  /// Code exigé (démarrage, inactivité, retour dans l'application).
  locked,

  unlocked,
}

@immutable
final class AppLockState {
  const AppLockState(
    this.phase, {
    this.remaining,
    this.busy = false,
    this.veiled = false,
  });

  final LockPhase phase;

  /// Essais restants après une erreur ; null sans erreur.
  final int? remaining;

  /// Dérivation du code en cours.
  final bool busy;

  /// L'application est quittée : son contenu est voilé (aperçu des
  /// applications récentes) jusqu'au retour.
  final bool veiled;
}

/// Message montré à la connexion (trop d'erreurs de code, reconnexion exigée,
/// tablette révoquée).
final lockoutNoticeProvider = NotifierProvider<LockoutNotice, String?>(
  LockoutNotice.new,
);

class LockoutNotice extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? value) => state = value;
}

/// Ce qui disparaît quand l'agent change ou se déconnecte : les sites
/// sensibles qu'il a ouverts (ses consultations restent à remonter).
final lockCleanupProvider = Provider<Future<void> Function(String? userId)>(
  (ref) =>
      (next) =>
          ref.read(appDatabaseProvider).sensitiveDao.purgeOtherUsers(next),
);

/// Agent connecté (sujet de son jeton), ou null.
final _userIdProvider = Provider<String?>(
  (ref) =>
      ref.watch(authControllerProvider.select((state) => state.value?.user.id)),
);

/// Quand l'agent change ou se déconnecte, son code (et le secret de
/// l'installation qui l'accompagne) et ses sites sensibles ne restent pas sur
/// la tablette partagée. Observé par la racine de l'application.
final lockCleanupBridgeProvider = Provider<void>((ref) {
  ref.listen<String?>(_userIdProvider, (previous, next) {
    if (previous == null || previous == next) return;
    unawaited(() async {
      const logger = AppLogger('lock');
      try {
        await ref.read(localCodeStoreProvider).clear();
        await ref.read(lockCleanupProvider)(next);
        logger.info('Code et sites sensibles de l’agent précédent effacés.');
      } on Object catch (error) {
        // Rattrapé à la prochaine ouverture : un site sensible n’est rouvert
        // que par l’agent qui l’a ouvert, et avec son code.
        logger.warning(
          'Nettoyage au changement d’agent incomplet.',
          error: error,
        );
      }
    }());
  });
});

final lockControllerProvider = NotifierProvider<LockController, AppLockState>(
  LockController.new,
);

/// Verrou de l'application : code choisi à la connexion, exigé au démarrage,
/// après l'inactivité et au retour dans l'application selon la politique du
/// SIS (SEC-05) ; cinq erreurs déconnectent l'agent, qui se reconnecte en
/// ligne (rien d'installé n'est effacé). La politique borne aussi le temps
/// depuis la dernière connexion par mot de passe.
class LockController extends Notifier<AppLockState> {
  static const _logger = AppLogger('lock');

  Duration _lastActivity = Duration.zero;

  /// Départ de l'application : horloge de démarrage (veille comprise), et
  /// horloge du processus à défaut.
  MonotonicTime? _leftAt;
  Duration? _leftAtProcess;

  LocalCodeStore get _codes => ref.read(localCodeStoreProvider);
  Duration get _monotonic => ref.read(monotonicClockProvider)();
  TerminalPolicy get _policy => ref.read(terminalPolicyProvider);
  String? get _userId => ref.read(_userIdProvider);

  @override
  AppLockState build() {
    final userId = ref.watch(_userIdProvider);
    if (userId == null) return const AppLockState(LockPhase.inactive);
    unawaited(_resolve(userId));
    return const AppLockState(LockPhase.checking);
  }

  Future<void> _resolve(String userId) async {
    final set = await _codes.isSetFor(userId);
    if (!ref.mounted || _userId != userId) return;
    // Au démarrage, le code est exigé avant toute consultation.
    state = AppLockState(set ? LockPhase.locked : LockPhase.setup);
    await checkSession();
  }

  /// Premier code de l'agent sur cette tablette.
  Future<void> choose(String code) async {
    final userId = _userId;
    if (userId == null || state.phase != LockPhase.setup) return;
    state = const AppLockState(LockPhase.setup, busy: true);
    await _codes.set(userId, code);
    if (!ref.mounted) return;
    _lastActivity = _monotonic;
    state = const AppLockState(LockPhase.unlocked);
  }

  /// Saisie du code sur l'écran de verrouillage.
  Future<void> unlock(String code) async {
    final userId = _userId;
    if (userId == null || state.phase != LockPhase.locked) return;
    state = AppLockState(
      LockPhase.locked,
      remaining: state.remaining,
      busy: true,
    );
    final check = await _codes.verify(userId, code);
    if (!ref.mounted) return;
    switch (check) {
      case LocalCodeAccepted():
        _lastActivity = _monotonic;
        state = const AppLockState(LockPhase.unlocked);
      case LocalCodeRejected(:final remaining):
        state = AppLockState(LockPhase.locked, remaining: remaining);
      case LocalCodeLockedOut():
        await lockOut();
    }
  }

  /// Trop d'erreurs (ici ou à l'ouverture d'un site sensible) : déconnexion.
  Future<void> lockOut() async {
    ref
        .read(lockoutNoticeProvider.notifier)
        .set(
          'Trop d’erreurs de code : reconnectez-vous avec votre mot de passe '
          '(réseau requis). Les ETARE installés n’ont pas été effacés.',
        );
    _logger.warning('Code erroné cinq fois : déconnexion.');
    await ref.read(authControllerProvider.notifier).signOut();
  }

  /// Une interaction de l'agent repousse le verrouillage.
  void activity() {
    if (state.phase == LockPhase.unlocked) _lastActivity = _monotonic;
  }

  /// Verrouille après l'inactivité fixée par le SIS.
  void checkIdle() {
    if (state.phase == LockPhase.unlocked &&
        !state.veiled &&
        _monotonic - _lastActivity >= _policy.idleLock) {
      lock();
    }
  }

  /// L'agent quitte l'application (autre application, écran éteint) :
  /// verrouillée tout de suite, ou voilée jusqu'au retour selon la politique.
  Future<void> leave() async {
    if (state.phase != LockPhase.unlocked) return;
    if (_policy.backgroundLockSeconds == 0) {
      lock();
      return;
    }
    state = const AppLockState(LockPhase.unlocked, veiled: true);
    _leftAtProcess = _monotonic;
    _leftAt = await ref.read(platformServicesProvider).monotonicTime();
  }

  /// Retour dans l'application : verrouillée si l'absence a dépassé la
  /// politique, mesurée sur l'horloge de démarrage (veille comprise).
  Future<void> back() async {
    if (state.phase != LockPhase.unlocked || !state.veiled) return;
    final away = await _absence();
    if (!ref.mounted || state.phase != LockPhase.unlocked) return;
    if (away >= _policy.backgroundLock) {
      lock();
    } else {
      _lastActivity = _monotonic;
      state = const AppLockState(LockPhase.unlocked);
    }
  }

  Future<Duration> _absence() async {
    final left = _leftAt;
    final now = await ref.read(platformServicesProvider).monotonicTime();
    _leftAt = null;
    if (left != null && now != null) {
      // Redémarrée entre-temps : l'absence est longue, quoi qu'en dise l'horloge.
      if (left.bootCount != now.bootCount) return const Duration(days: 1);
      return Duration(milliseconds: now.elapsedMs - left.elapsedMs);
    }
    final process = _leftAtProcess;
    return process == null ? Duration.zero : _monotonic - process;
  }

  /// Durée maximale depuis la dernière connexion par mot de passe (politique
  /// du SIS), mesurée sur l'heure de confiance : au-delà, l'agent se
  /// reconnecte en ligne, rien d'installé n'est effacé.
  Future<void> checkSession() async {
    final session = ref.read(authControllerProvider).value;
    if (session == null) return;
    final now = ref.read(trustedNowProvider)();
    final signedInAt = session.signedInAt;
    if (signedInAt == null) {
      // Session ouverte avant SEC-05 : le délai part d'aujourd'hui.
      await ref.read(authControllerProvider.notifier).markSignedIn(now);
      return;
    }
    if (now.difference(signedInAt) < _policy.maxWithoutLogin) return;
    ref
        .read(lockoutNoticeProvider.notifier)
        .set(
          'Votre SIS demande une nouvelle connexion avec votre mot de passe '
          '(réseau requis). Les ETARE installés n’ont pas été effacés.',
        );
    _logger.info('Durée de session dépassée : déconnexion.');
    await ref.read(authControllerProvider.notifier).signOut();
  }

  void lock() {
    if (state.phase == LockPhase.unlocked) {
      state = const AppLockState(LockPhase.locked);
    }
  }
}
