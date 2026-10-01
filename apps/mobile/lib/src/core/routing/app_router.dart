import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/startup/presentation/splash_screen.dart';
import 'package:etare_ops/src/features/sync/presentation/enrollment_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

export 'package:etare_ops/src/core/routing/app_routes.dart';

/// Règle de redirection (fonction pure, testée unitairement) :
/// - session en cours de restauration → écran d'attente ;
/// - non authentifié → `/login` ;
/// - authentifié sur `/login` ou l'écran d'attente → `/home`.
String? resolveRedirect({
  required AuthStatus status,
  required String location,
}) => switch (status) {
  AuthStatus.unknown => location == AppRoutes.splash ? null : AppRoutes.splash,
  AuthStatus.unauthenticated =>
    location == AppRoutes.login ? null : AppRoutes.login,
  AuthStatus.authenticated =>
    location == AppRoutes.login || location == AppRoutes.splash
        ? AppRoutes.home
        : null,
};

final routerProvider = Provider<GoRouter>((ref) {
  final authStatus = ValueNotifier<AuthStatus>(
    authStatusOf(ref.read(authControllerProvider)),
  );
  ref.listen(
    authControllerProvider,
    (_, next) => authStatus.value = authStatusOf(next),
  );

  final router = GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: authStatus,
    redirect: (context, state) => resolveRedirect(
      status: authStatus.value,
      location: state.matchedLocation,
    ),
    // Lien inconnu : retour à l'écran d'attente, qui redirige selon la session.
    onException: (context, state, router) => router.go(AppRoutes.splash),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
        routes: [
          GoRoute(
            path: 'enroll',
            builder: (context, state) => const EnrollmentScreen(),
          ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    authStatus.dispose();
  });
  return router;
});
