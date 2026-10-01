import 'dart:async';

import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/account/domain/role_labels.dart';
import 'package:etare_ops/src/features/account/domain/user_account.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/sync/presentation/offline_status_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Compte, SIS actif et état détaillé de la tablette (enrôlement,
/// synchronisation). Hors des écrans OPS : aucune donnée de site ici.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  static const signOutButtonKey = Key('account.signOut');

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Compte et tablette')),
    body: SafeArea(
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(currentAccountProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            _AccountCard(),
            SizedBox(height: 16),
            OfflineStatusCard(),
            SizedBox(height: 24),
            _SignOutButton(),
          ],
        ),
      ),
    ),
  );
}

class _AccountCard extends ConsumerWidget {
  const _AccountCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final sessionEmail = ref.watch(
      authControllerProvider.select((s) => s.value?.user.email),
    );
    final account = ref.watch(currentAccountProvider);
    final activeTenant = ref.watch(activeTenantControllerProvider);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Connecté en tant que',
              style: textTheme.bodyMedium?.copyWith(
                color: BrandColors.textMuted,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              account.value?.email ?? sessionEmail ?? '—',
              style: textTheme.titleMedium,
            ),
            if (account.value?.displayName case final name?)
              Text(name, style: textTheme.bodyLarge),
            const Divider(height: 32),
            switch (account) {
              AsyncError(:final error) => _LoadError(
                message: describeError(error),
                onRetry: () => ref.invalidate(currentAccountProvider),
              ),
              AsyncData(value: final UserAccount data) => _TenantSection(
                account: data,
                active: activeTenant.value,
              ),
              _ => const _Loading(label: 'Chargement du profil…'),
            },
          ],
        ),
      ),
    );
  }
}

class _TenantSection extends ConsumerWidget {
  const _TenantSection({required this.account, required this.active});

  final UserAccount account;
  final Membership? active;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final membership = active;
    if (account.memberships.isEmpty) {
      return Text(
        'Aucun SIS n’est associé à votre compte. Contactez votre '
        'administrateur.',
        style: textTheme.bodyLarge?.copyWith(color: BrandColors.important),
      );
    }
    if (membership == null) {
      return const _Loading(label: 'Sélection du SIS…');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SIS actif',
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: Text(membership.tenantName, style: textTheme.titleLarge),
            ),
            if (account.memberships.length > 1)
              TextButton.icon(
                onPressed: () => unawaited(
                  _chooseTenant(context, ref, account.memberships, membership),
                ),
                icon: const Icon(Icons.swap_horiz),
                label: const Text('Changer'),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          'Rôles',
          style: textTheme.bodyMedium?.copyWith(color: BrandColors.textMuted),
        ),
        const SizedBox(height: 8),
        if (membership.roles.isEmpty)
          Text('Aucun rôle attribué', style: textTheme.bodyLarge)
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final role in membership.roles)
                Chip(label: Text(roleLabel(role))),
            ],
          ),
      ],
    );
  }

  Future<void> _chooseTenant(
    BuildContext context,
    WidgetRef ref,
    List<Membership> memberships,
    Membership current,
  ) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'Choisir le SIS actif',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            for (final m in memberships)
              ListTile(
                title: Text(m.tenantName),
                subtitle: Text(m.roles.map(roleLabel).join(', ')),
                trailing: m.tenantId == current.tenantId
                    ? const Icon(Icons.check_circle, color: BrandColors.success)
                    : null,
                selected: m.tenantId == current.tenantId,
                onTap: () => Navigator.of(context).pop(m.tenantId),
              ),
          ],
        ),
      ),
    );
    if (selected == null || selected == current.tenantId) return;
    await ref.read(activeTenantControllerProvider.notifier).select(selected);
  }
}

class _SignOutButton extends ConsumerStatefulWidget {
  const _SignOutButton();

  @override
  ConsumerState<_SignOutButton> createState() => _SignOutButtonState();
}

class _SignOutButtonState extends ConsumerState<_SignOutButton> {
  bool _busy = false;

  Future<void> _signOut() async {
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).signOut();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    key: AccountScreen.signOutButtonKey,
    onPressed: _busy ? null : _signOut,
    icon: _busy
        ? const SizedBox.square(
            dimension: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : const Icon(Icons.logout),
    label: const Text('Se déconnecter'),
  );
}

class _Loading extends StatelessWidget {
  const _Loading({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      const SizedBox.square(
        dimension: 24,
        child: CircularProgressIndicator(strokeWidth: 3),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text(label, style: Theme.of(context).textTheme.bodyLarge),
      ),
    ],
  );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: BrandColors.critical),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyLarge
                  ?.copyWith(color: BrandColors.critical),
            ),
          ),
        ],
      ),
      if (onRetry != null) ...[
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Réessayer'),
        ),
      ],
    ],
  );
}
