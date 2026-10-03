# ForgeNord Vote

Plateforme autonome de consultations FR/EN sur Astro SSR, TypeScript et Cloudflare Workers. Worker : `forgenord-vote`; D1 : `forgenord-vote-db`; binding : `DB`. Aucune dépendance envers Giocoso Hunt ou ses campagnes.

## État de livraison

Socle Docker, schéma D1, consultations publiques bilingues, vote ou proposition avec autorisation de réutilisation et confirmation promotionnelle. La gestion locale, les coordonnées facultatives, les mentions autorisées et les inscriptions séparées aux tirages sont disponibles. Les contenus de la première consultation doivent être validés avant publication.

## Démarrage Docker

Docker Compose est requis. Les commandes utilisent Node 24 dans le conteneur, sous votre UID/GID (définir `LOCAL_UID` et `LOCAL_GID` si différents de 1000).

```sh
docker compose run --rm app npm ci
docker compose run --rm app npm run migrate:local
docker compose up app admin
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

Les consultations ont des slugs uniques et des dates facultatives indépendantes de tout événement externe. Les horaires doivent être fournis au format UTC ISO 8601. Une participation par navigateur et consultation peut devenir un vote ou une proposition; le service remplace les lignes de choix dans une transaction D1. Le cookie pseudonyme ne garantit pas une personne unique. Aucun IP ou emplacement n’est enregistré par l’application.

Les tables `votes`, `proposals`, `contacts`, `consents` et `draw_entries` séparent les concepts. Les propositions exigent une autorisation de réutilisation dont le texte FR/EN et la version sont conservés. Les mentions publiques et contacts pour un tirage exigent des permissions distinctes. Les coordonnées ne sont pas nécessaires pour voter ou recevoir le code promo.

Les tirages sont fermés par défaut. La base refuse leur activation sans modalités bilingues versionnées et validées, et refuse les inscriptions hors période. Aucun tirage automatique n’est prévu.

## Code promotionnel

La table `poll_parameters` contient, par consultation, `promo_code`, `promo_starts_at` et `promo_ends_at`. Aucun code réel ni code de démonstration n’est versionné. La fonction serveur `promotionFor` exige une participation existante et une période valide avant de retourner le code. L’écran de confirmation utilise cette fonction avec une réponse `Cache-Control: no-store`.

Le code sera nécessairement visible dans le HTML de confirmation fourni à la personne; il n’est pas un secret individuel. Il ne doit apparaître ni dans les sources Astro, ni dans le bundle client, ni dans les logs. Sa validité effective et son utilisation restent contrôlées dans Etsy. L’expiration ne ferme pas la consultation. La saisie se fait dans la gestion locale; aucun éditeur SQL libre n’est prévu.

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

Après validation des contenus et autorisation explicite, construire avec la configuration distante choisie au build :

```sh
docker compose run --rm -e FORGENORD_WRANGLER_CONFIG=wrangler.production.jsonc app npm run build
docker compose run --rm app npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

Vérifier que `dist/server/wrangler.json` cible bien `forgenord-vote`, la D1 attendue et le domaine `vote.forgenord.ca`. Après autorisation de déploiement :

```sh
docker compose run --rm -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler deploy --config dist/server/wrangler.json
```

Le build et le dry-run ont été vérifiés avec la simulation locale; la liaison aux ressources distantes reste à vérifier avant déploiement. Ne pas déployer la configuration locale : son identifiant est fictif. Aucun déploiement automatique ou fusion automatique.

## Démonstration locale

`docker compose run --rm app npx wrangler d1 execute forgenord-vote-db --local --file scripts/seed-demo.sql` crée une consultation brouillon et sept options. Aucun lien Etsy, code promo ou autorisation de réutilisation n’est inventé. Valider les noms, les descriptions FR/EN et le texte d’autorisation avant publication via la gestion locale. Les images copiées seules depuis Giocoso Hunt sont dans `public/models/`; `grandpic.jpg` est le nom exact.

## Gestion locale

Ouvrir http://127.0.0.1:8790 après les migrations. Ce service Docker séparé utilise uniquement la D1 locale, sans jeton Cloudflare et sans éditeur SQL libre. Son code dans `admin/` ne fait pas partie des routes Astro et n’est pas inclus dans le Worker public. Ne jamais déployer son fichier Wrangler.

Les formulaires gèrent consultations, options, propositions privées, paramètres promotionnels et tirages. Les slugs des consultations existantes sont stables. Les options se désactivent avec `archived=1`; elles ne sont pas supprimées. Les dates sont en UTC, par exemple `2026-10-02T12:00:00Z`. Les périodes de consultation sont facultatives; celle d’un code promo exige un début et une fin. Les formulaires utilisent les noms des champs du schéma; la liste affiche au plus 200 lignes par table.

Pour ouvrir une consultation : fournir les titres et descriptions FR/EN, les sept noms définitifs, les liens Etsy facultatifs et le texte d’autorisation de reproduction/commercialisation FR/EN avec une version, puis passer `status` à `published`. Une proposition exige l’acceptation de ce texte; un vote ne l’exige pas. Les propositions ne sont jamais publiées automatiquement. Le code est saisi uniquement dans le formulaire Promotion; il n’est pas réaffiché dans la gestion.

Pour ouvrir un tirage : réviser et publier ses modalités FR/EN dans les champs du tirage, renseigner leur version, leur date de validation et la période éventuelle, puis `enabled=1`. Les modalités sont affichées sur la page d’inscription. Un vote ne crée aucune inscription. La permission de mention publique est indépendante du contact pour le tirage. Un moyen de contact est requis seulement pour enregistrer ces permissions ou participer au tirage. Le serveur ne réalise aucune communication automatique ni attribution de prix.

La gestion de la D1 de production depuis cette interface est reportée; l’interface MVP gère la simulation locale. Le déploiement public et les opérations distantes restent soumis à autorisation explicite. Définir la durée de conservation des coordonnées et valider les textes avant d’ouvrir la collecte en production.

Vérification HTTP locale avec des données synthétiques (création d’une consultation temporaire ensuite remise en brouillon) : `docker compose exec app node scripts/check-local.mjs`. Arrêter les serveurs avant le build pour éviter une concurrence sur le cache Vite.

Après un vote ou une proposition enregistré, le formulaire facultatif « Coordonnées et autorisation de mention » apparaît directement sur la consultation et reste accessible après rechargement dans le même navigateur. Il est indépendant du tirage et ne conditionne ni le vote ni le code promotionnel.

Les photos des options ouvrent leur lien externe HTTPS dans un nouvel onglet lorsque `external_url` est renseigné dans la gestion. Pour Giocoso Creation, saisir l’URL de la fiche Etsy correspondante. Sans lien valide, la photo reste affichée sans lien.

Après participation, la consultation affiche les résultats agrégés : miniature et nom du modèle, nombre de votes et pourcentage arrondi à une décimale. Le dénominateur comprend uniquement les votes pour des modèles de cette consultation, y compris les options archivées; les propositions ne sont pas des votes pour un modèle. Le tableau reste visible après rechargement dans le même navigateur et affiche 0,0 % sans vote. Aucun résultat n’est affiché avant participation.
