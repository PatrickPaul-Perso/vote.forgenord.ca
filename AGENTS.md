# ForgeNord Vote

## Identité du projet

- Service public : `vote.forgenord.ca`.
- Plateforme autonome de consultations, votes et propositions d’idées.
- Première consultation : modèles Giocoso Creation.
- Le service doit rester réutilisable pour d’autres consultations et organismes.
- Giocoso Hunt peut créer un lien vers une consultation, mais ForgeNord Vote ne dépend ni de sa D1, ni de ses campagnes, ni de ses routes de scan.

## Architecture

- Utiliser Astro SSR, TypeScript et l’adaptateur Cloudflare officiel.
- Déployer sur Cloudflare Workers, pas Cloudflare Pages.
- Utiliser un Worker et une base D1 propres à ForgeNord Vote.
- Garder les migrations D1 versionnées dans le dépôt.
- Ne jamais mettre de `database_id`, jeton ou autre secret réel dans Git.
- Le service de gestion est distinct du Worker public, lancé localement par Docker et jamais inclus dans son déploiement.
- Ne pas ajouter d’éditeur SQL libre à l’interface de gestion.

## Consultations et données

- Chaque consultation possède un slug public stable; ses options, votes et propositions lui sont rattachés.
- Les consultations ne doivent contenir aucune logique codée uniquement pour Giocoso Creation ou Halloween.
- Les options peuvent avoir une photo du dépôt et un lien externe facultatif.
- Valider les liens externes avant de les afficher.
- Les votes, propositions, coordonnées de contact, consentements et participations à un tirage sont des concepts distincts.
- Un vote ne crée pas automatiquement une entrée de tirage.
- Les tirages restent fermés tant que leurs modalités ne sont pas publiées et validées.
- Ne pas collecter d’adresse IP ou de localisation. Ne collecter que les renseignements nécessaires à la fonctionnalité activée.

## Langues et expérience

- Toutes les pages publiques et leurs erreurs doivent être disponibles en français et en anglais.
- Choisir la langue initiale selon le navigateur, puis mémoriser le choix FR/EN de la personne.
- Garder les URLs de consultation indépendantes de la langue.
- Une consultation doit être accessible directement, sans scan NFC ni compte Giocoso Hunt.
- Afficher clairement si la consultation ou son tirage est fermé.

## Travail et livraison

- Lire aussi les AGENTS.md des répertoires parents.
- Ne pas modifier le dépôt Giocoso Hunt depuis ce projet.
- Obtenir une validation du schéma D1 et de la configuration Wrangler avant de modifier migrations, bindings ou fichiers Wrangler.
- Ne pas créer de ressource Cloudflare distante et ne pas déployer sans autorisation explicite.
- Utiliser une branche par changement cohérent et présenter les changements dans une PR; ne pas fusionner sans demande explicite.
- Exécuter les vérifications et le build dans Docker avant de proposer une PR.
- Documenter les migrations, le démarrage local, les variables nécessaires et le déploiement dans le README.
- Ne jamais committer de secrets, de bases locales, d’état Wrangler ou de fichiers générés.
