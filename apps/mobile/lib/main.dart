import 'package:etare_ops/src/bootstrap.dart';

/// Point d'entrée de l'application OPS.
///
/// Configuration via `--dart-define` (voir README) : ENV, API_BASE_URL,
/// AUTH_URL, AUTH_PUBLISHABLE_KEY.
Future<void> main() => bootstrap();
