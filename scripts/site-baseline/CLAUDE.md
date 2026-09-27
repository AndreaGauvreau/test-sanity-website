# scripts/site-baseline (site-adapter)

Captures de référence du site public et preuve de rendu identique. Doc : `docs/admin/research/site-baseline/README.md`.

- `capture.ts` : PNG pleine page (4 largeurs), texte, HTML. Rendu déterministe (drapeaux Chrome) et **format
  d'image figé** : `image-format.ts` fixe l'`Accept` des requêtes d'images sans AVIF, sinon cdn.sanity.io
  (`auto=format`) alterne AVIF/WebP et la référence ne se rejoue pas à 0 pixel. Ne pas retirer.
- `compare.ts` : pixelmatch seuil 0 + texte. `check-html.ts` : ni data-edit ni stega, balises SEO.
- Tests (hors vitest, qui ne lit que src/ et engine/) : `npx tsx --test scripts/site-baseline/image-format.test.ts`.
- Serveur de dev attendu sur http://127.0.0.1:4040 ; ne jamais le lancer ni l'arrêter depuis un agent.
