# ADR-004 — Application OPS offline-first

- Statut : acceptée (fondations) — Sprint 0, 27/09/2026
- Sources : cahier des charges §6, OFF-01..05 ; architecture technique §06, §10, §11, §12, §19

## Contexte

L’intervenant doit consulter sites, plans, risques, accès et coupures sans réseau, en moins de 2 s,
sur une tablette Android. Le terminal peut être perdu.

## Décision

- Application **Flutter**, Android d’abord, structure compatible iOS.
- L’application lit **toujours** sa base locale ; le réseau n’alimente qu’une tâche de synchronisation
  indépendante (non développée au Sprint 0).
- Base locale **Drift + SQLite chiffrée SQLCipher dès le Sprint 0** (le cahier des charges fait du
  chiffrement une exigence P0 ; migrer plus tard une base en clair serait plus risqué). Clé aléatoire
  de 32 octets dans le stockage sécurisé Android.
- La synchronisation reposera sur des **publications immuables empaquetées et signées** (ADR-005), jamais
  sur une réplication de la base serveur ni sur Supabase Realtime.
- Jetons dans le stockage sécurisé ; sauvegardes Android désactivées ; permission `INTERNET` seule.

## Point ouvert (à arbitrer au sprint de synchronisation)

Granularité des mises à jour différentielles : le cahier des charges (OFF-02) parle d’objets modifiés,
l’architecture (§11) de fichiers ajoutés ou modifiés adressés par empreinte. **Tranché le 01/10/2026 par
l’ADR-015** : différentiel par empreinte de fichier, le fichier de données du site étant retransmis en
entier quand le site change.

## Conséquences

- Les fichiers (PDF, plans, tuiles) ne sont pas couverts par SQLCipher : chiffrement propre à prévoir.
- Le prototype matériel (tablette cible, mode avion, carte locale, coupures) doit précéder l’UI OPS
  finale (architecture §32).

## Critère de réexamen

Résultat du prototype sur la tablette cible (performance, compatibilité SQLCipher, stockage).
