import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final localCodeStoreProvider = Provider<LocalCodeStore>(
  (ref) => LocalCodeStore(ref.watch(secureStoreProvider)),
);

/// Où en est le verrou applicatif (PER-02, SEC-05).
enum LockPhase {
  /// Personne n'est connecté : la connexion en ligne s'en charge.
  inactive,

  /// Lecture de l'état au démarrage : rien n'est montré.
  checking,

  /// Connecté sans code sur cette tablette : il faut en choisir un.
  setup,

  /// Code exigé (démarrage, 15 minutes d'inactivité).
  locked,

  unlocked,
}

@immutable
final class AppLockState {
  const AppLockState(this.phase, {this.remaining, this.busy = false});

  final LockPhase phase;

  /// Essais restants après une erreur ; null sans erreur.
  final int? remaining;

  /// Dérivation du code en cours.
  final bool busy;
}

/// Message montré à la connexion après trop d'erreurs de code.
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

/// Quand l'agent change ou se déconnecte, son code et ses sites sensibles ne
/// restent pas sur la tablette partagée. Observé par la racine de l'application.
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

/// Verrou de l'application : code choisi à la connexion, exigé au démarrage
/// et après 15 minutes d'inactivité ; cinq erreurs déconnectent l'agent, qui
/// se reconnecte en ligne (rien d'installé n'est effacé).
class LockController extends Notifier<AppLockState> {
  static const _logger = AppLogger('lock');

  DateTime _lastActivity = DateTime.fromMillisecondsSinceEpoch(0);

  LocalCodeStore get _codes => ref.read(localCodeStoreProvider);
  DateTime get _now => ref.read(clockProvider)();
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
  }

  /// Premier code de l'agent sur cette tablette.
  Future<void> choose(String code) async {
    final userId = _userId;
    if (userId == null || state.phase != LockPhase.setup) return;
    state = const AppLockState(LockPhase.setup, busy: true);
    await _codes.set(userId, code);
    if (!ref.mounted) return;
    _lastActivity = _now;
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
        _lastActivity = _now;
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
    if (state.phase == LockPhase.unlocked) _lastActivity = _now;
  }

  /// Verrouille si l'agent est inactif depuis 15 minutes.
  void checkIdle() {
    if (state.phase == LockPhase.unlocked &&
        _now.difference(_lastActivity) >= localLockAfter) {
      lock();
    }
  }

  void lock() {
    if (state.phase == LockPhase.unlocked) {
      state = const AppLockState(LockPhase.locked);
    }
  }
}
