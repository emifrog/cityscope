import 'package:etare_ops/src/features/home/domain/site_link.dart';
import 'package:flutter_test/flutter_test.dart';

const site = '06000002-0000-4000-8000-000000000001';

void main() {
  test('lit l’identifiant du site d’un lien, quelle que soit son adresse', () {
    expect(siteIdOfLink('https://firescape.io/sites/$site'), site);
    expect(
      siteIdOfLink(' http://127.0.0.1:3000/sites/${site.toUpperCase()}/ '),
      site,
    );
    expect(siteIdOfLink('https://firescape.io/sites/$site?onglet=plans'), site);
  });

  test('refuse tout ce qui n’est pas un lien de site', () {
    expect(siteIdOfLink('ETARE 06-0428'), isNull);
    expect(siteIdOfLink('https://firescape.io/sites/pas-un-uuid'), isNull);
    expect(siteIdOfLink('https://firescape.io/publications/$site'), isNull);
    expect(siteIdOfLink('etare://sites/$site'), isNull);
  });
}
