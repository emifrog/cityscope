import 'dart:async';

import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/presentation/code_pad.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_providers.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_site_service.dart';
import 'package:etare_ops/src/features/sync/application/package_verification.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Ouverture d'un site sensible « restreint » (PER-02, ADR-025) : le code est
/// demandé à chaque ouverture ; la première fois, le site est téléchargé
/// (réseau requis) puis gardé chiffré 24 h sur la tablette.
class SensitiveSiteScreen extends ConsumerStatefulWidget {
  const SensitiveSiteScreen({required this.siteId, super.key});

  final String siteId;

  static const statusKey = Key('sensitive.status');

  @override
  ConsumerState<SensitiveSiteScreen> createState() =>
      _SensitiveSiteScreenState();
}

class _SensitiveSiteScreenState extends ConsumerState<SensitiveSiteScreen> {
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Le code est demandé à chaque ouverture, même déverrouillé il y a peu.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final unlocked = ref.read(unlockedSitesProvider.notifier);
      if (ref.read(unlockedSitesProvider).containsKey(widget.siteId)) {
        unlocked.clear();
      }
      unawaited(ref.read(sensitiveSiteServiceProvider).purgeExpired());
    });
  }

  Future<void> _submit(String code, {required bool opened}) async {
    final userId = ref.read(authControllerProvider).value?.user.id;
    if (userId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final service = ref.read(sensitiveSiteServiceProvider);
    try {
      final site = opened
          ? await service.unlock(
              userId: userId,
              siteId: widget.siteId,
              code: code,
            )
          : await service.open(
              userId: userId,
              siteId: widget.siteId,
              code: code,
            );
      if (!mounted) return;
      ref.read(unlockedSitesProvider.notifier).put(site);
      context.pushReplacement(AppRoutes.site(widget.siteId));
    } on SensitiveCodeRejected catch (error) {
      _fail(
        'Code erroné : encore ${error.remaining} essai${error.remaining > 1 ? 's' : ''} '
        'avant la déconnexion.',
      );
    } on SensitiveCodeLockedOut {
      await ref.read(lockControllerProvider.notifier).lockOut();
    } on SensitiveSiteUnavailable catch (error) {
      _fail(error.message);
    } on SyncIntegrityException catch (error) {
      _fail(
        'Contenu refusé à la vérification (${error.code}) : il n’a pas été ouvert.',
      );
    } on Object catch (error) {
      _fail(describeError(error));
    }
  }

  void _fail(String message) {
    if (mounted) {
      setState(() {
        _busy = false;
        _error = message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final opened = ref.watch(openedSensitiveSiteProvider(widget.siteId)).value;
    final offered = ref
        .watch(onDemandResultsProvider)
        .value
        ?.where((site) => site.siteId == widget.siteId)
        .firstOrNull;
    final now = ref.watch(clockProvider)().toUtc();
    final valid =
        opened != null &&
        !now.isBefore(opened.openedAt) &&
        now.isBefore(opened.expiresAt);
    final name = opened?.siteName ?? offered?.siteName ?? 'Site sensible';
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.shield_outlined,
                    size: 48,
                    color: BrandColors.critical,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Site sensible',
                    style: textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    valid
                        ? 'Ouvert sur cette tablette jusqu’au '
                              '${formatDateTimeFr(opened.expiresAt)}. Saisissez votre code.'
                        : 'Ouverture à la demande : réseau requis, consultable 24 h, '
                              'votre code demandé à chaque ouverture. Chaque consultation est '
                              'tracée.',
                    key: SensitiveSiteScreen.statusKey,
                    style: textTheme.bodyLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  if (_busy)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    )
                  else
                    CodePad(
                      error: _error,
                      onCompleted: (code) =>
                          unawaited(_submit(code, opened: valid)),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
