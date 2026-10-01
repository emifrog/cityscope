import 'dart:async';

import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/theme/app_theme.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/auth_error_messages.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Validation du champ e-mail (message français ou `null` si valide).
String? validateEmail(String? value) {
  final email = value?.trim() ?? '';
  if (email.isEmpty) return 'Saisissez votre adresse e-mail.';
  if (!_emailPattern.hasMatch(email)) return 'Adresse e-mail invalide.';
  return null;
}

/// Validation du champ mot de passe.
String? validatePassword(String? value) =>
    (value == null || value.isEmpty) ? 'Saisissez votre mot de passe.' : null;

/// Connexion e-mail / mot de passe. Produit sur invitation : ni inscription,
/// ni « mot de passe oublié » dans l'application.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  static const emailFieldKey = Key('login.email');
  static const passwordFieldKey = Key('login.password');
  static const submitButtonKey = Key('login.submit');
  static const errorBannerKey = Key('login.error');

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static const _logger = AppLogger('login');

  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();

  bool _submitting = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

    FocusScope.of(context).unfocus();
    setState(() => _submitting = true);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .signIn(
            email: _emailController.text,
            password: _passwordController.text,
          );
      // La redirection vers l'accueil est assurée par le routeur.
    } on Object catch (error) {
      _logger.info('Échec de connexion : $error');
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: AutofillGroup(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _BrandHeader(),
                      const SizedBox(height: 32),
                      Semantics(
                        header: true,
                        child: Text('Connexion', style: textTheme.titleLarge),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        key: LoginScreen.emailFieldKey,
                        controller: _emailController,
                        enabled: !_submitting,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        enableSuggestions: false,
                        autofillHints: const [
                          AutofillHints.username,
                          AutofillHints.email,
                        ],
                        style: textTheme.bodyLarge,
                        decoration: const InputDecoration(
                          labelText: 'Adresse e-mail',
                          prefixIcon: Icon(Icons.alternate_email),
                        ),
                        validator: validateEmail,
                        onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        key: LoginScreen.passwordFieldKey,
                        controller: _passwordController,
                        focusNode: _passwordFocus,
                        enabled: !_submitting,
                        obscureText: _obscurePassword,
                        textInputAction: TextInputAction.done,
                        autocorrect: false,
                        enableSuggestions: false,
                        autofillHints: const [AutofillHints.password],
                        style: textTheme.bodyLarge,
                        decoration: InputDecoration(
                          labelText: 'Mot de passe',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscurePassword
                                ? 'Afficher le mot de passe'
                                : 'Masquer le mot de passe',
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword,
                            ),
                          ),
                        ),
                        validator: validatePassword,
                        onFieldSubmitted: (_) => unawaited(_submit()),
                      ),
                      if (_error case final error?) ...[
                        const SizedBox(height: 16),
                        _ErrorBanner(
                          key: LoginScreen.errorBannerKey,
                          message: error,
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        key: LoginScreen.submitButtonKey,
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox.square(
                                dimension: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 3,
                                  color: BrandColors.textMuted,
                                  semanticsLabel: 'Connexion en cours',
                                ),
                              )
                            : const Text('Se connecter'),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Accès sur invitation uniquement. En cas de problème '
                        'de compte, contactez l’administrateur de votre SIS.',
                        style: textTheme.bodyMedium?.copyWith(
                          color: BrandColors.textMuted,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      children: [
        const Image(
          image: AssetImage(Brand.logoAsset),
          width: 220,
          semanticLabel: Brand.productName,
        ),
        const SizedBox(height: 12),
        Text(
          Brand.appSubtitle,
          style: textTheme.bodyLarge?.copyWith(color: BrandColors.textMuted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      constraints: const BoxConstraints(minHeight: AppTheme.minTouchTarget),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BrandColors.critical.withValues(alpha: 0.08),
        border: Border.all(color: BrandColors.critical, width: 2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: BrandColors.critical),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: BrandColors.critical,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
