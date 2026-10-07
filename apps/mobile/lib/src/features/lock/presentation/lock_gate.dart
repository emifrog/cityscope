import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/lock/presentation/code_pad.dart';
import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Verrou posé au-dessus de toute l'application (navigation et documents
/// ouverts compris) : choix du code à la première connexion, code exigé au
/// démarrage, après l'inactivité et au retour dans l'application selon la
/// politique du SIS (ADR-025, SEC-05). Applique aussi l'interdiction des
/// captures d'écran et tient l'heure de confiance à jour.
class LockGate extends ConsumerStatefulWidget {
  const LockGate({required this.child, super.key});

  final Widget child;

  static const setupKey = Key('lock.setup');
  static const lockedKey = Key('lock.locked');
  static const veilKey = Key('lock.veil');

  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate> {
  Timer? _timer;
  late final AppLifecycleListener _lifecycle;

  LockController get _lock => ref.read(lockControllerProvider.notifier);

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => _tick());
    _lifecycle = AppLifecycleListener(
      // Autre application, écran éteint : verrouillée ou voilée (SEC-05).
      onHide: () => unawaited(_lock.leave()),
      onShow: () => unawaited(_returned()),
    );
    // Captures d'écran et aperçu des applications récentes, selon le SIS.
    ref.listenManual<TerminalPolicy>(terminalPolicyProvider, (_, policy) {
      unawaited(
        ref
            .read(platformServicesProvider)
            .setSecureWindow(secure: !policy.screenshotsAllowed),
      );
    }, fireImmediately: true);
  }

  Future<void> _returned() async {
    await ref.read(trustedClockProvider).refresh();
    if (!mounted) return;
    await _lock.back();
    _lock.checkIdle();
    await _lock.checkSession();
  }

  Future<void> _tick() async {
    _lock.checkIdle();
    final clock = ref.read(trustedClockProvider);
    await clock.refresh();
    await clock.persist();
    if (mounted) await _lock.checkSession();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(lockCleanupBridgeProvider);
    final lock = ref.watch(lockControllerProvider);
    final covered = switch (lock.phase) {
      LockPhase.unlocked when lock.veiled => const _Blank(
        key: LockGate.veilKey,
      ),
      LockPhase.inactive || LockPhase.unlocked => null,
      LockPhase.checking => const _Blank(),
      LockPhase.setup => _SetupScreen(busy: lock.busy, key: LockGate.setupKey),
      LockPhase.locked => _UnlockScreen(lock: lock, key: LockGate.lockedKey),
    };
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) =>
          ref.read(lockControllerProvider.notifier).activity(),
      child: Stack(
        children: [
          // Rien de lisible ni d'actionnable sous le verrou.
          ExcludeSemantics(
            excluding: covered != null,
            child: IgnorePointer(
              ignoring: covered != null,
              child: widget.child,
            ),
          ),
          ?covered,
        ],
      ),
    );
  }
}

class _Blank extends StatelessWidget {
  const _Blank({super.key});

  @override
  Widget build(BuildContext context) =>
      const ColoredBox(color: BrandColors.background, child: SizedBox.expand());
}

class _Frame extends StatelessWidget {
  const _Frame({required this.title, required this.text, required this.child});

  final String title;
  final String text;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Material(
      color: BrandColors.background,
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.lock_outline,
                    size: 48,
                    color: BrandColors.navy,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    text,
                    textAlign: TextAlign.center,
                    style: textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 16),
                  child,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Premier code : saisi deux fois.
class _SetupScreen extends ConsumerStatefulWidget {
  const _SetupScreen({required this.busy, super.key});

  final bool busy;

  @override
  ConsumerState<_SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<_SetupScreen> {
  String? _first;
  String? _error;

  @override
  Widget build(BuildContext context) => _Frame(
    title: _first == null ? 'Choisissez votre code' : 'Confirmez votre code',
    text:
        'Six chiffres, personnels. Ils déverrouillent l’application après '
        '${ref.watch(terminalPolicyProvider).idleLockMinutes} minute(s) '
        'd’inactivité ou à votre retour, et ouvrent les sites sensibles.',
    child: widget.busy
        ? const Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(),
          )
        : CodePad(
            error: _error,
            onCompleted: (code) {
              final first = _first;
              if (first == null) {
                setState(() {
                  _first = code;
                  _error = null;
                });
              } else if (first != code) {
                setState(() {
                  _first = null;
                  _error = 'Les deux saisies diffèrent : recommencez.';
                });
              } else {
                unawaited(
                  ref.read(lockControllerProvider.notifier).choose(code),
                );
              }
            },
          ),
  );
}

class _UnlockScreen extends ConsumerWidget {
  const _UnlockScreen({required this.lock, super.key});

  final AppLockState lock;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final email = ref.watch(
      authControllerProvider.select((state) => state.value?.user.email),
    );
    final remaining = lock.remaining;
    return _Frame(
      title: 'Application verrouillée',
      text: 'Saisissez votre code${email == null ? '' : ' ($email)'}.',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (lock.busy)
            const Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            )
          else
            CodePad(
              error: remaining == null
                  ? null
                  : 'Code erroné : encore $remaining essai${remaining > 1 ? 's' : ''} '
                        'avant la déconnexion.',
              onCompleted: (code) => unawaited(
                ref.read(lockControllerProvider.notifier).unlock(code),
              ),
            ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () =>
                unawaited(ref.read(authControllerProvider.notifier).signOut()),
            child: const Text('Changer d’agent (se déconnecter)'),
          ),
        ],
      ),
    );
  }
}
