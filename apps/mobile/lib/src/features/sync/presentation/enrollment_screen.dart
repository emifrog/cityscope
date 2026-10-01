import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Enrôlement de la tablette avec le code remis par l'administrateur du SIS
/// (ADR-015). Nécessite le réseau ; ensuite, la consultation est locale.
class EnrollmentScreen extends ConsumerStatefulWidget {
  const EnrollmentScreen({super.key});

  static const codeFieldKey = Key('enroll.code');
  static const submitButtonKey = Key('enroll.submit');

  @override
  ConsumerState<EnrollmentScreen> createState() => _EnrollmentScreenState();
}

class _EnrollmentScreenState extends ConsumerState<EnrollmentScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final tenant = ref.read(activeTenantControllerProvider).value;
    if (tenant == null) {
      setState(
        () => _error = 'Sélectionnez d’abord votre SIS (réseau requis).',
      );
      return;
    }
    if (normalizeEnrollmentCode(_code.text) == null) {
      setState(
        () => _error = 'Le code comporte 12 caractères (lettres et chiffres).',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(enrollmentServiceProvider)
          .enroll(tenantId: tenant.tenantId, code: _code.text);
      ref.invalidate(deviceIdentityProvider);
      ref.read(syncControllerProvider.notifier).synchronizeInBackground();
      if (mounted) context.pop();
    } on EnrollmentCodeInvalid {
      setState(() => _error = 'Code d’enrôlement invalide.');
    } on Object catch (error) {
      setState(() => _error = describeError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final tenant = ref.watch(activeTenantControllerProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Enrôler cette tablette')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Saisissez le code à usage unique remis par l’administrateur de '
              'votre SIS. La tablette crée sa propre clé : aucun secret ne '
              'transite par ce code.',
              style: textTheme.bodyLarge,
            ),
            const SizedBox(height: 8),
            if (tenant != null)
              Text('SIS : ${tenant.tenantName}', style: textTheme.titleMedium),
            const SizedBox(height: 24),
            TextField(
              key: EnrollmentScreen.codeFieldKey,
              controller: _code,
              enabled: !_busy,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              enableSuggestions: false,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9 -]')),
                LengthLimitingTextInputFormatter(16),
              ],
              style: textTheme.headlineSmall?.copyWith(letterSpacing: 4),
              decoration: const InputDecoration(
                labelText: 'Code d’enrôlement',
                hintText: 'ABCD-EFGH-JKLM',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (_error case final error?) ...[
              const SizedBox(height: 12),
              Text(
                error,
                style: textTheme.bodyLarge?.copyWith(
                  color: BrandColors.critical,
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              key: EnrollmentScreen.submitButtonKey,
              onPressed: _busy ? null : _submit,
              icon: _busy
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.verified_user_outlined),
              label: const Text('Enrôler la tablette'),
            ),
          ],
        ),
      ),
    );
  }
}
