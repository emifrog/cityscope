import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/features/account/presentation/account_screen.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/home/presentation/scan_screen.dart';
import 'package:etare_ops/src/features/map/presentation/map_screen.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/presentation/plan_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/section_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/reports/presentation/my_reports_screen.dart';
import 'package:etare_ops/src/features/reports/presentation/report_form_screen.dart';
import 'package:etare_ops/src/features/sensitive/presentation/sensitive_site_screen.dart';
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
          GoRoute(
            path: 'account',
            builder: (context, state) => const AccountScreen(),
          ),
          GoRoute(
            path: 'scan',
            builder: (context, state) => const ScanScreen(),
          ),
          GoRoute(
            path: 'reports',
            builder: (context, state) => const MyReportsScreen(),
          ),
          GoRoute(
            path: 'map',
            builder: (context, state) =>
                MapScreen(siteId: state.uri.queryParameters['site']),
          ),
          GoRoute(
            path: 'sensitive/:siteId',
            builder: (context, state) =>
                SensitiveSiteScreen(siteId: state.pathParameters['siteId']!),
          ),
          GoRoute(
            path: 'site/:siteId',
            builder: (context, state) =>
                SiteScreen(siteId: state.pathParameters['siteId']!),
            routes: [
              GoRoute(
                path: 'section/:section',
                builder: (context, state) => SectionScreen(
                  siteId: state.pathParameters['siteId']!,
                  section:
                      OpsSection.values
                          .where(
                            (s) => s.name == state.pathParameters['section'],
                          )
                          .firstOrNull ??
                      OpsSection.risks,
                ),
              ),
              GoRoute(
                path: 'report',
                builder: (context, state) {
                  final item = state.uri.queryParameters['item']?.split(':');
                  final plan = state.uri.queryParameters['plan']?.split(':');
                  return ReportFormScreen(
                    siteId: state.pathParameters['siteId']!,
                    itemType: item?.length == 2 ? item![0] : null,
                    itemId: item?.length == 2 ? item![1] : null,
                    planRevisionId: plan?.length == 3 ? plan![0] : null,
                    planX: plan?.length == 3 ? double.tryParse(plan![1]) : null,
                    planY: plan?.length == 3 ? double.tryParse(plan![2]) : null,
                  );
                },
              ),
              GoRoute(
                path: 'plan/:planId',
                builder: (context, state) => PlanScreen(
                  siteId: state.pathParameters['siteId']!,
                  planId: state.pathParameters['planId']!,
                  focusId: state.uri.queryParameters['focus'],
                ),
              ),
            ],
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
