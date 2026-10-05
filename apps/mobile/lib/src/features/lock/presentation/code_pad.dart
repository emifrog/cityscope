import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Saisie d'un code à six chiffres sur un pavé à grosses touches (gants,
/// tablette), sans clavier système : le code n'apparaît jamais à l'écran.
class CodePad extends StatefulWidget {
  const CodePad({
    required this.onCompleted,
    this.enabled = true,
    this.error,
    super.key,
  });

  /// Appelé avec les six chiffres ; le pavé se vide ensuite.
  final ValueChanged<String> onCompleted;
  final bool enabled;
  final String? error;

  static Key digitKey(int digit) => Key('codepad.$digit');
  static const eraseKey = Key('codepad.erase');

  @override
  State<CodePad> createState() => _CodePadState();
}

class _CodePadState extends State<CodePad> {
  String _code = '';

  void _press(int digit) {
    if (!widget.enabled || _code.length >= localCodeLength) return;
    setState(() => _code += '$digit');
    if (_code.length == localCodeLength) {
      final code = _code;
      setState(() => _code = '');
      widget.onCompleted(code);
    }
  }

  void _erase() {
    if (_code.isEmpty) return;
    setState(() => _code = _code.substring(0, _code.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    Widget key(
      Widget label,
      VoidCallback onTap, {
      Key? key,
      String? semantics,
    }) => Padding(
      padding: const EdgeInsets.all(6),
      child: SizedBox(
        width: 84,
        height: 72,
        child: Semantics(
          button: true,
          label: semantics,
          child: OutlinedButton(
            key: key,
            onPressed: widget.enabled ? onTap : null,
            child: label,
          ),
        ),
      ),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          label: '${_code.length} chiffre(s) saisi(s) sur $localCodeLength',
          excludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var index = 0; index < localCodeLength; index++)
                Container(
                  margin: const EdgeInsets.all(6),
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: index < _code.length
                        ? BrandColors.navy
                        : Colors.transparent,
                    border: Border.all(color: BrandColors.navy, width: 2),
                  ),
                ),
            ],
          ),
        ),
        if (widget.error case final error?)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              error,
              textAlign: TextAlign.center,
              style: textTheme.bodyLarge?.copyWith(color: BrandColors.critical),
            ),
          ),
        const SizedBox(height: 16),
        for (final row in const [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ])
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final digit in row)
                key(
                  Text('$digit', style: textTheme.headlineSmall),
                  () => _press(digit),
                  key: CodePad.digitKey(digit),
                ),
            ],
          ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 96),
            key(
              Text('0', style: textTheme.headlineSmall),
              () => _press(0),
              key: CodePad.digitKey(0),
            ),
            key(
              const Icon(Icons.backspace_outlined),
              _erase,
              key: CodePad.eraseKey,
              semantics: 'Effacer un chiffre',
            ),
          ],
        ),
      ],
    );
  }
}
