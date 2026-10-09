/// Lien d'un site, porté par le QR code imprimé sur le dossier ETARE
/// (`https://<adresse du back-office>/sites/<identifiant>`). Il ne nomme que
/// le site : ni secret, ni droit d'accès. Miroir de `siteIdOfLink`
/// (`packages/domain/src/site-link.ts`).
final RegExp _siteLink = RegExp(
  r'^https?://[^/?#\s]+/sites/'
  r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
  r'/?(?:[?#]\S*)?$',
  caseSensitive: false,
);

/// Identifiant du site d'un texte scanné, ou null si ce n'est pas un lien de
/// site, quelle que soit l'adresse du back-office qui l'a imprimé.
String? siteIdOfLink(String text) =>
    _siteLink.firstMatch(text.trim())?.group(1)?.toLowerCase();
