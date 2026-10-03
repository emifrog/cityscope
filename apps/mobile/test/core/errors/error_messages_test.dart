import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('codes de sécurité de l’API (Sprint 9)', () {
    test('second facteur et limitation de débit sont reconnus', () {
      expect(ApiErrorCode.fromWire('MFA_REQUIRED'), ApiErrorCode.mfaRequired);
      expect(ApiErrorCode.fromWire('RATE_LIMITED'), ApiErrorCode.rateLimited);
      expect(ApiErrorCode.fromStatus(429), ApiErrorCode.rateLimited);
    });

    test('les messages orientent sans révéler de détail technique', () {
      expect(
        describeError(
          const ApiException(code: ApiErrorCode.mfaRequired, message: 'x'),
        ),
        contains('back-office'),
      );
      expect(
        describeError(
          const ApiException(code: ApiErrorCode.rateLimited, message: 'x'),
        ),
        contains('réessayez'),
      );
    });
  });
}
