# ForgeNord Vote

Plateforme autonome de consultations FR/EN sur Astro SSR, TypeScript et Cloudflare Workers. Worker : `forgenord-vote`; D1 : `forgenord-vote-db`; binding : `DB`. Aucune dépendance envers Giocoso Hunt ou ses campagnes.

## État de livraison

Première PR : socle Docker, schéma D1 et lecture serveur du code promotionnel. La page d’accueil est provisoire. Les consultations publiques, formulaires et interface de gestion arrivent dans les PR suivantes; ce socle ne doit pas encore être déployé en production.

## Démarrage Docker

Docker Compose est requis. Les commandes utilisent Node 24 dans le conteneur, sous votre UID/GID (définir `LOCAL_UID` et `LOCAL_GID` si différents de 1000).

```sh
docker compose run --rm app npm ci
docker compose run --rm app npm run migrate:local
docker compose up app
```

Ouvrir http://127.0.0.1:4321. Arrêt : `docker compose down`. L’état local reste dans `.wrangler/`, ignoré par Git. L’identifiant D1 versionné est fictif et sert uniquement à la simulation locale. Ne copier aucune base ou configuration de Giocoso Hunt.

## Vérifications

```sh
docker compose run --rm app npm test
docker compose run --rm app npm run build
docker compose run --rm app npx wrangler deploy --dry-run
```

Les tests SQLite vérifient les contraintes relationnelles. Les contrôles Wrangler locaux valident la migration dans le runtime D1.

## Données et consentements

Les consultations ont des slugs uniques et des dates facultatives indépendantes de tout événement externe. Les horaires doivent être fournis au format UTC ISO 8601. Une participation par navigateur et consultation peut devenir un vote ou une proposition; le service devra remplacer les lignes de choix dans une transaction D1. Le cookie pseudonyme ne garantit pas une personne unique. Aucun IP ou emplacement n’est enregistré par l’application.

Les tables `votes`, `proposals`, `contacts`, `consents` et `draw_entries` séparent les concepts. Les propositions exigent une autorisation de réutilisation dont le texte FR/EN et la version sont conservés. Les mentions publiques et contacts pour un tirage exigent des permissions distinctes. Les coordonnées ne sont pas nécessaires pour voter ou recevoir le code promo.

Les tirages sont fermés par défaut. La base refuse leur activation sans modalités bilingues versionnées et validées, et refuse les inscriptions hors période. Aucun tirage automatique n’est prévu.

## Code promotionnel

La table `poll_parameters` contient, par consultation, `promo_code`, `promo_starts_at` et `promo_ends_at`. Aucun code réel ni code de démonstration n’est versionné. La fonction serveur `promotionFor` exige une participation existante et une période valide avant de retourner le code. Le futur écran de confirmation utilisera cette fonction avec une réponse `Cache-Control: no-store`.

Le code sera nécessairement visible dans le HTML de confirmation fourni à la personne; il n’est pas un secret individuel. Il ne doit apparaître ni dans les sources Astro, ni dans le bundle client, ni dans les logs. Sa validité effective et son utilisation restent contrôlées dans Etsy. L’expiration ne ferme pas la consultation. La saisie se fera dans la gestion locale; aucun éditeur SQL libre n’est prévu.

## Configuration distante et déploiement

Les ressources existent déjà; ne pas en créer d’autres. Les secrets et identifiants réels restent hors Git. Variables nécessaires pour les opérations distantes : `FORGENORD_D1_DATABASE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Le jeton doit être limité au compte et aux opérations requises.

Générer la configuration ignorée depuis une variable d’environnement externe :

```sh
docker compose run --rm -e FORGENORD_D1_DATABASE_ID app node scripts/production-config.mjs
```

Après autorisation explicite, vérifier la cible et sauvegarder D1 hors dépôt avant une migration distante :

```sh
docker compose run --rm -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler d1 migrations list forgenord-vote-db --remote --config wrangler.production.jsonc
docker compose run --rm -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler d1 migrations apply forgenord-vote-db --remote --config wrangler.production.jsonc
```

Construire avec la configuration de production sélectionnée au build (`FORGENORD_WRANGLER_CONFIG=wrangler.production.jsonc`), vérifier que la configuration générée cible bien `forgenord-vote` et la bonne D1, puis effectuer le dry-run avant tout déploiement autorisé. La procédure finale sera vérifiée avec les versions verrouillées avant livraison du MVP. Ne pas déployer la configuration locale : son identifiant est fictif. Aucun déploiement automatique ou fusion automatique.
