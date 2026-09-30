import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/features/sites/data/api_sites_repository.dart';
import 'package:etare_ops/src/features/sites/domain/sites_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Sprint 0 : seul le repository est exposé (aucun écran « sites » encore).
final sitesRepositoryProvider = Provider<SitesRepository>(
  (ref) => ApiSitesRepository(ref.watch(etareApiClientProvider)),
);
