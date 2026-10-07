# etare_platform

Paquet privé de l'application OPS : services Android appelés par `MethodChannel`
(`fr.etare.platform`).

| Service | Usage |
| --- | --- |
| `createDeviceKey`, `signWithDeviceKey`, `devicePublicKey`, `deleteDeviceKey`, `deviceKeySecurity` | Clé du terminal ECDSA P-256 du Keystore Android (StrongBox si présent), jamais extractible (SEC-05, ADR-029) |
| `monotonicTime` | Temps depuis le démarrage (veille comprise) et nombre de démarrages : horloge insensible au réglage de l'heure |
| `availableBytes` | Espace libre du volume de l'application (CAP-02) |
| `setSecureWindow` | `FLAG_SECURE` : ni capture d'écran ni aperçu dans les applications récentes ; actif par défaut |

Sans implémentation (iOS, tests), les appels lèvent `MissingPluginException` :
l'application garde ses replis logiciels.
