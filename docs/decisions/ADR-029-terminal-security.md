# ADR-029 — Sécurité du terminal : clé du Keystore, politique du SIS, horloge de confiance et analyse des risques

- Statut : acceptée — Sprint 13, 07/10/2026
- Sources : roadmap R4, SEC-05 (« verrouillage applicatif selon le parc, politique
  déconnexion/expiration, rotation/récupération de clé locale, test d'horloge manipulée et de tablette
  partagée. Attestation, détection root et épinglage de certificat à arbitrer par l'analyse de risques,
  pas à présumer obligatoires ») ; architecture technique §19 (paire de clés « protégée par Android
  Keystore lorsque le matériel le permet », verrouillage local après inactivité, horloge locale
  manipulable, perte et fin de vie) ; cahier des charges §7 (secrets dans les mécanismes sécurisés du
  terminal) ; ADR-015, ADR-016, ADR-025 ; choix du porteur du 7 octobre 2026
- Complète l'ADR-015 (clé du terminal), l'ADR-016 (stockage local) et l'ADR-025 (verrou et code personnel)

## Contexte

Jusqu'au Sprint 12, la tablette prouvait ses requêtes avec une clé Ed25519 logicielle. Sa graine était
gardée dans le stockage sécurisé, chiffrée par une clé du Keystore, mais elle était extractible en
mémoire. Le verrou applicatif suivait des valeurs codées en dur (15 minutes d'inactivité, rien en
quittant l'application). Les captures d'écran étaient possibles. Tous les contrôles de durée lisaient
l'horloge réglable de la tablette.

L'exploration du Sprint 13 a aussi relevé deux failles :

- la carte montrait les sites installés sans l'autorisation de consultation ;
- la révocation effaçait les données mais laissait la session, le code personnel et la clé de la base.

## Décision

Choix du porteur du 7 octobre 2026 : réglages par SIS avec des valeurs par défaut durcies, et une
analyse écrite sans détection de root, sans attestation et sans épinglage.

1. **Clé du terminal dans le Keystore.**
   - Une nouvelle tablette génère une clé ECDSA P-256 dans le Keystore Android : StrongBox quand la
     tablette en a un, l'environnement de confiance sinon. Elle n'est jamais extractible.
   - La tablette envoie sa clé publique (SubjectPublicKeyInfo) et l'algorithme à l'enrôlement. Le serveur
     vérifie chaque preuve dans l'algorithme de la clé (SHA256withECDSA, signature DER).
   - Une tablette de la première génération passe d'elle-même au Keystore à sa première
     synchronisation (`POST /sync/device-key`). La requête est signée par l'ancienne clé ; la nouvelle
     signe le texte de rotation (`etare.device-key.v1`). L'ancienne clé est refusée aussitôt.
   - La rotation est auditée (`device.key_rotated`, empreintes des clés, jamais les clés).
   - Une réponse perdue est reprise au passage suivant : le serveur refuse alors l'ancienne clé, et la
     nouvelle prouve la rotation.
   - Si le Keystore est réinitialisé, la clé est perdue : la tablette se purge et doit être réenrôlée.
   - Un plugin local (`apps/mobile/packages/etare_platform`) porte ces appels. Il sert aussi l'horloge
     monotone, l'espace libre et la protection de l'écran.
2. **Politique des tablettes réglée par le SIS** (Administration › Terminaux, `device:manage`, second
   facteur, auditée). Elle est portée par le catalogue signé ; la tablette applique celle de son dernier
   catalogue.

   | Réglage                                              | Défaut                    | Bornes       |
   | ---------------------------------------------------- | ------------------------- | ------------ |
   | Verrouillage après inactivité                        | 5 min                     | 1 à 60 min   |
   | Verrouillage en quittant l'application               | immédiat                  | 0 à 600 s    |
   | Captures d'écran et aperçu des applications récentes | interdits (`FLAG_SECURE`) | —            |
   | Reconnexion par mot de passe                         | 30 jours                  | 1 à 90 jours |
   | Consultation hors ligne (fin de l'autorisation)      | 7 jours                   | 1 à 14 jours |
   - Pendant un délai de sortie non nul, l'application est voilée.
   - Au-delà de la durée sans reconnexion, l'agent se reconnecte en ligne ; rien d'installé n'est effacé.

3. **Horloge de confiance.**
   - Chaque catalogue fixe un repère : l'heure du serveur et l'horloge monotone de la tablette (temps
     depuis le démarrage, veille comprise). Tant que la tablette n'a pas redémarré, l'heure se déduit du
     repère : reculer ou avancer l'horloge n'y change rien.
   - Après un redémarrage, l'horloge de l'appareil ne descend jamais sous la plus haute heure déjà
     constatée. Une horloge avancée écourte l'autorisation, jamais l'inverse ; le catalogue suivant
     corrige le plancher.
   - Elle sert à l'autorisation de consultation, aux 24 heures des sites sensibles et à la durée de
     session.
   - L'inactivité au premier plan se mesure sur l'horloge monotone du processus, l'absence sur celle de
     démarrage.
4. **Révocation complète.** Données, fonds, identité et clés du Keystore sont effacés. Puis viennent la
   session, le code personnel et son secret d'installation. Enfin la base locale est rechiffrée avec une
   nouvelle clé.
   - Chaque étape est tentée, même si une autre échoue.
   - L'agent est déconnecté. Le motif l'attend à la connexion, même si la purge a eu lieu application
     fermée.
5. **Tablette partagée** (individualisation décidée par l'ADR-025).
   - Au changement d'agent, le code et le secret de l'installation sont effacés, ainsi que les sites
     sensibles ouverts.
   - L'agent suivant ne consulte rien avant sa propre synchronisation : l'autorisation reçue nomme
     l'agent précédent. La carte comprise : elle n'affiche plus rien sans autorisation.
6. **Analyse des risques : ce qui n'est pas retenu, et pourquoi.**

   | Mesure                                   | Décision    | Raison                                                                                                                                                                                                                                                                                                                                             |
   | ---------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Détection de root                        | Non retenue | Contournable par un appareil compromis, source de faux positifs, et sans effet sur un appareil déjà maîtrisé par l'attaquant. Le parc est géré (MDM prioritaire, architecture §19) : c'est au MDM de refuser un appareil modifié.                                                                                                                  |
   | Attestation d'intégrité (Play Integrity) | Non retenue | Elle dépend des services Google et d'un projet Google Cloud, et rendrait un appareil sans services Google inutilisable au moment critique. L'attestation de clé du Keystore pourra être vérifiée à l'enrôlement si l'analyse SEC-06 le demande.                                                                                                    |
   | Épinglage de certificat                  | Non retenu  | Un certificat renouvelé sur le serveur (par exemple Let's Encrypt sur un VPS) couperait toutes les tablettes jusqu'à une nouvelle version. La configuration réseau n'accepte que les autorités du système : un certificat installé par l'utilisateur n'est pas reconnu. Tout contenu reçu est en outre signé (manifestes, catalogue, jeu de clés). |
   | Protection de l'écran                    | Retenue     | `FLAG_SECURE` par défaut, levé si le SIS l'autorise.                                                                                                                                                                                                                                                                                               |

   Ces choix sont à revoir avec l'analyse de risques et le test d'intrusion (SEC-06).

## Conséquences

- La graine Ed25519 disparaît de la tablette après sa rotation.
- Les preuves deviennent plus lentes. L'émulateur met environ 5 s à générer la clé et quelques dizaines
  de millisecondes à chaque signature ; StrongBox est plus lent encore.
- Une tablette dont le Keystore est réinitialisé (restauration d'usine, données de l'application effacées)
  doit être réenrôlée. Ses signalements non transmis sont perdus, comme à une
  révocation.
- Le serveur garde la vérification Ed25519 pour les tablettes pas encore mises à jour. Une version
  minimale (`MOBILE_MIN_APP_VERSION`) pourra la retirer plus tard.
- La politique augmente la génération du catalogue : chaque tablette la reçoit à son prochain contact.
- Limites qui restent :
  - un appareil compromis peut toujours tricher sur l'horloge entre deux redémarrages, ou lire la
    mémoire de l'application déverrouillée ;
  - le code à six chiffres reste exposé à un essai exhaustif par qui détient à la fois le secret de
    l'installation et la base ;
  - la révocation n'agit qu'au prochain contact.

## Critère de réexamen

Analyse de risques et test d'intrusion (SEC-06), décision de distribution (DEC-01 : MDM ou installation
manuelle), tablette de référence (temps de signature StrongBox, comportement du Keystore à la
réinitialisation), politique du RSSI sur les durées.
