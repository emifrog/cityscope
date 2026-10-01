import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Thème « terrain » : cibles tactiles ≥ 48 dp (boutons principaux 56 dp),
/// contrastes élevés, typographie agrandie pour une lecture en faible
/// luminosité ou en mouvement.
abstract final class AppTheme {
  /// Hauteur minimale des boutons d'action principaux.
  static const double primaryButtonHeight = 56;

  /// Cible tactile minimale (recommandation Material / WCAG 2.5.5).
  static const double minTouchTarget = 48;

  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: BrandColors.navy,
      onPrimary: BrandColors.onDark,
      secondary: BrandColors.accentStrong,
      onSecondary: BrandColors.onDark,
      tertiary: BrandColors.info,
      onTertiary: BrandColors.onDark,
      error: BrandColors.critical,
      onError: BrandColors.onDark,
      surface: BrandColors.surface,
      onSurface: BrandColors.text,
      onSurfaceVariant: BrandColors.textMuted,
      outline: BrandColors.textMuted,
      outlineVariant: BrandColors.border,
      surfaceContainerLowest: BrandColors.surface,
      surfaceContainerLow: BrandColors.surface,
      surfaceContainer: BrandColors.background,
      surfaceContainerHigh: BrandColors.background,
      surfaceContainerHighest: BrandColors.border,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: BrandColors.background,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
    );

    final textTheme = base.textTheme
        .copyWith(
          headlineMedium: base.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
          titleLarge: base.textTheme.titleLarge?.copyWith(
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
          titleMedium: base.textTheme.titleMedium?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
          bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 18),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 16),
          labelLarge: base.textTheme.labelLarge?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        )
        .apply(bodyColor: BrandColors.text, displayColor: BrandColors.text);

    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
    );
    const buttonMinSize = Size(minTouchTarget * 2, primaryButtonHeight);

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: const AppBarThemeData(
        backgroundColor: BrandColors.navy,
        foregroundColor: BrandColors.onDark,
        centerTitle: false,
        elevation: 0,
        toolbarHeight: 64,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: BrandColors.onDark,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: BrandColors.accentStrong,
          foregroundColor: BrandColors.onDark,
          disabledBackgroundColor: BrandColors.border,
          disabledForegroundColor: BrandColors.textMuted,
          minimumSize: buttonMinSize,
          textStyle: textTheme.labelLarge,
          shape: buttonShape,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BrandColors.navy,
          minimumSize: buttonMinSize,
          side: const BorderSide(color: BrandColors.navy, width: 2),
          textStyle: textTheme.labelLarge,
          shape: buttonShape,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BrandColors.navy,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          textStyle: textTheme.labelLarge,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(minTouchTarget, minTouchTarget),
        ),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: BrandColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 18,
        ),
        labelStyle: textTheme.bodyLarge?.copyWith(color: BrandColors.textMuted),
        floatingLabelStyle: const TextStyle(
          color: BrandColors.navy,
          fontWeight: FontWeight.w600,
        ),
        errorStyle: textTheme.bodyMedium?.copyWith(
          color: BrandColors.critical,
          fontWeight: FontWeight.w600,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.textMuted),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.textMuted),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.navy, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.critical, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.critical, width: 2),
        ),
      ),
      cardTheme: CardThemeData(
        color: BrandColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: BrandColors.border),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: BrandColors.background,
        side: const BorderSide(color: BrandColors.border),
        labelStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      ),
      listTileTheme: const ListTileThemeData(
        minTileHeight: 56,
        iconColor: BrandColors.navy,
      ),
      dividerTheme: const DividerThemeData(color: BrandColors.border),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: BrandColors.navy,
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: BrandColors.text,
        contentTextStyle: TextStyle(fontSize: 16, color: BrandColors.onDark),
      ),
    );
  }
}
