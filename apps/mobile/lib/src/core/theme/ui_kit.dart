import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Briques visuelles communes aux écrans de la tablette, alignées sur le
/// back-office web : pictogramme dans une case teintée, badge d'état, carte
/// de section, ligne de liste, état vide. Cibles tactiles ≥ 48 dp.

/// Tonalité d'un état : couleur du texte et teinte douce du fond.
enum Tone {
  neutral(BrandColors.textMuted, BrandColors.subtle),
  navy(BrandColors.navy, BrandColors.subtle),
  info(BrandColors.info, BrandColors.infoSoft),
  success(BrandColors.success, BrandColors.successSoft),
  important(BrandColors.important, BrandColors.importantSoft),
  critical(BrandColors.critical, BrandColors.criticalSoft);

  const Tone(this.color, this.soft);

  final Color color;
  final Color soft;
}

/// Pictogramme dans une case arrondie teintée ; [child] remplace l'icône
/// (ex. le chiffre d'une gravité).
class PictoBox extends StatelessWidget {
  const PictoBox({
    this.icon,
    this.child,
    this.tone = Tone.navy,
    this.color,
    this.background,
    this.size = 44,
    super.key,
  }) : assert(icon != null || child != null, 'icon ou child');

  final IconData? icon;
  final Widget? child;
  final Tone tone;

  /// Couleurs explicites (catégories de points, gravités) ; sinon [tone].
  final Color? color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    final foreground = color ?? tone.color;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? tone.soft,
        borderRadius: BorderRadius.circular(size >= 56 ? 16 : 12),
      ),
      alignment: Alignment.center,
      child:
          child ??
          Icon(icon, color: foreground, size: size >= 56 ? 32 : size / 2),
    );
  }
}

/// Badge d'état : texte court sur fond doux, sans bordure.
class StatusBadge extends StatelessWidget {
  const StatusBadge(
    this.text, {
    this.tone = Tone.neutral,
    this.icon,
    super.key,
  });

  final String text;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: tone.soft,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 16, color: tone.color),
          const SizedBox(width: 4),
        ],
        Flexible(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: tone.color, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

/// Carte à en-tête (pictogramme, titre, description, statut à droite) et
/// contenu ; [padded] à false laisse le contenu coller aux bords (listes).
class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.icon,
    required this.title,
    required this.child,
    this.description,
    this.aside,
    this.tone = Tone.navy,
    this.padded = true,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? description;
  final Widget? aside;
  final Tone tone;
  final bool padded;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PictoBox(icon: icon, tone: tone, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: textTheme.titleMedium),
                      if (description case final text?)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            text,
                            style: textTheme.bodyMedium?.copyWith(
                              color: BrandColors.textMuted,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                if (aside case final widget?) ...[
                  const SizedBox(width: 12),
                  widget,
                ],
              ],
            ),
          ),
          if (padded)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: child,
            )
          else
            child,
        ],
      ),
    );
  }
}

/// Ligne de liste : pictogramme, titre, sous-titre, badges, action à droite.
class OpsRow extends StatelessWidget {
  const OpsRow({
    required this.leading,
    required this.title,
    this.subtitle,
    this.badges = const [],
    this.trailing,
    this.onTap,
    this.titleStyle,
    super.key,
  });

  final Widget leading;
  final String title;
  final String? subtitle;
  final List<Widget> badges;
  final Widget? trailing;
  final VoidCallback? onTap;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: titleStyle ?? textTheme.titleMedium),
                  if (subtitle case final text? when text.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        text,
                        style: textTheme.bodyMedium?.copyWith(
                          color: BrandColors.textMuted,
                        ),
                      ),
                    ),
                  if (badges.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(spacing: 6, runSpacing: 6, children: badges),
                    ),
                ],
              ),
            ),
            if (trailing case final widget?) ...[
              const SizedBox(width: 8),
              widget,
            ] else if (onTap != null) ...[
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: BrandColors.textMuted),
            ],
          ],
        ),
      ),
    );
  }
}

/// « Rien ici » : pictogramme rond, titre et explication, action facultative.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    this.text,
    this.tone = Tone.navy,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? text;
  final Tone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: tone.soft,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 32, color: tone.color),
              ),
              const SizedBox(height: 16),
              Text(
                title,
                textAlign: TextAlign.center,
                style: textTheme.titleMedium,
              ),
              if (text case final body?) ...[
                const SizedBox(height: 6),
                Text(
                  body,
                  textAlign: TextAlign.center,
                  style: textTheme.bodyLarge?.copyWith(
                    color: BrandColors.textMuted,
                  ),
                ),
              ],
              if (action case final widget?) ...[
                const SizedBox(height: 16),
                widget,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Libellé et valeur côte à côte (fiche d'un point, état de la tablette).
class FieldRow extends StatelessWidget {
  const FieldRow(this.label, this.value, {this.selectable = true, super.key});

  final String label;
  final String value;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: textTheme.bodyMedium?.copyWith(
                color: BrandColors.textMuted,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: selectable
                ? SelectableText(value, style: textTheme.bodyLarge)
                : Text(value, style: textTheme.bodyLarge),
          ),
        ],
      ),
    );
  }
}

/// Bandeau d'alerte teinté, tout en largeur, touchable.
class NoticeStrip extends StatelessWidget {
  const NoticeStrip({
    required this.icon,
    required this.text,
    this.tone = Tone.info,
    this.detail,
    this.onTap,
    this.trailing,
    super.key,
  });

  final IconData icon;
  final String text;
  final String? detail;
  final Tone tone;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Material(
      color: tone.soft,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          child: Row(
            children: [
              Icon(icon, color: tone.color, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text,
                      style: textTheme.bodyLarge?.copyWith(
                        color: tone.color,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (detail case final more?)
                      Text(
                        more,
                        style: textTheme.bodyMedium?.copyWith(
                          color: tone.color,
                        ),
                      ),
                  ],
                ),
              ),
              if (trailing case final widget?) ...[
                const SizedBox(width: 8),
                widget,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
