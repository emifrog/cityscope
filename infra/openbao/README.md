# OpenBao (ou Vault) — moteur Transit des clés de signature

Exemple de mise en place pour SEC-04 ([ADR-027](../../docs/decisions/ADR-027-signing-keys-rotation.md)).
La procédure complète, rotation et compromission comprises, est dans
[docs/exploitation/cles-de-signature.md](../../docs/exploitation/cles-de-signature.md).

Principe : les clés privées de publication et de catalogue restent dans le moteur Transit, qui signe à la
demande. Elles ne sont ni exportables, ni sauvegardables en clair. Chaque processus a son jeton, limité à
sa propre clé :

- l'API signe les catalogues ;
- le worker signe les publications et les fonds de carte.

Une compromission de l'API ne donne donc pas la clé des publications.

```sh
bao secrets enable transit
# Clés non exportables, suppression interdite, rotation manuelle seulement : une nouvelle version ne
# signe qu'une fois annoncée par le jeu de clés (sinon les tablettes la refuseraient).
bao write -f transit/keys/etare-publication type=ed25519
bao write -f transit/keys/etare-catalog type=ed25519
bao policy write etare-api etare-api.hcl
bao policy write etare-worker etare-worker.hcl
bao policy write etare-key-ceremony etare-key-ceremony.hcl
```

Côté processus :

- `PUBLICATION_SIGNING_TRANSIT_KEY=etare-publication` (worker) ;
- `CATALOG_SIGNING_TRANSIT_KEY=etare-catalog` (API) ;
- `SIGNING_TRANSIT_URL`, `SIGNING_TRANSIT_TOKEN_FILE` : le jeton est écrit dans ce fichier par l'agent
  OpenBao (auto-authentification, renouvellement), jamais dans une variable d'environnement.

En local et en CI, OpenBao tourne en mode développement (`quay.io/openbao/openbao:2.7.1`, jeton racine
connu, données en mémoire). Ce mode est réservé aux essais.
