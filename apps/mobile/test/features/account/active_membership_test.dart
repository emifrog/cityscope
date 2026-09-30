import 'package:etare_ops/src/features/account/domain/role_labels.dart';
import 'package:etare_ops/src/features/account/domain/user_account.dart';
import 'package:flutter_test/flutter_test.dart';

const _a = Membership(
  tenantId: 'a',
  tenantName: 'SDIS A',
  tenantSlug: 'sdis-a',
  roles: ['OPS_USER'],
);
const _b = Membership(
  tenantId: 'b',
  tenantName: 'SDIS B',
  tenantSlug: 'sdis-b',
  roles: ['READER'],
);

void main() {
  group('resolveActiveMembership', () {
    test('aucun rattachement → null', () {
      expect(resolveActiveMembership(const [], 'a'), isNull);
    });

    test('SIS mémorisé toujours autorisé → conservé', () {
      expect(resolveActiveMembership(const [_a, _b], 'b'), _b);
    });

    test('SIS mémorisé absent ou révoqué → premier rattachement', () {
      expect(resolveActiveMembership(const [_a, _b], null), _a);
      expect(resolveActiveMembership(const [_a, _b], 'revoked'), _a);
    });
  });

  test('libellés de rôles : connus traduits, inconnus conservés', () {
    expect(roleLabel('PREVISION_VALIDATOR'), 'Valideur prévision');
    expect(roleLabel('NEW_ROLE'), 'NEW_ROLE');
  });
}
