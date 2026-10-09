import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Licences des composants embarqués que les paquets Dart ne déclarent pas
/// (EXP-04) : SQLCipher et OpenSSL (bibliothèque native de la base chiffrée),
/// glyphes Noto Sans de la carte (OFL 1.1), ML Kit du lecteur de QR code.
/// Affichées par la page des licences avec celles des paquets.
const bundledLicenses = {
  'SQLCipher Community Edition': 'assets/licenses/sqlcipher.txt',
  'OpenSSL': 'assets/licenses/openssl.txt',
  'Noto Sans (glyphes de la carte)': 'assets/map/glyphs/OFL.txt',
  'ML Kit Barcode Scanning (lecteur de QR code)':
      'assets/licenses/mlkit-barcode.txt',
};

var _registered = false;

/// À appeler une fois au démarrage.
void registerBundledLicenses() {
  if (_registered) return;
  _registered = true;
  LicenseRegistry.addLicense(() async* {
    for (final MapEntry(key: component, value: asset)
        in bundledLicenses.entries) {
      yield LicenseEntryWithLineBreaks([
        component,
      ], await rootBundle.loadString(asset));
    }
  });
}
