# Modèle du `CLAUDE.md` d'un module (« LLM context »)

Chaque module de l'admin et du moteur a un `CLAUDE.md` à sa racine. Claude Code le charge tout seul dès qu'il lit un
fichier du dossier : c'est le contexte qu'une future session (ou un humain) doit avoir pour modifier le module sans rien
casser. Il décrit l'état RÉEL du code, pas une intention. Court, factuel, à jour : un `CLAUDE.md` faux est pire qu'absent.
Rédigé en français ; les textes d'interface cités restent en anglais.

```markdown
# <Nom du module> — LLM context

> Propriétaire : <rôle d'agent> · Figma : <codes d'écrans> (docs/admin/figma/screens/<CODE>.md) · Mis à jour : <AAAA-MM-JJ>

## Utilité
Ce que fait le module, pour qui (rôles Kuartz / client / editor), où on le voit (routes), ce qu'il ne fait pas.

## Fichiers
- `chemin` — rôle en une ligne (tous les fichiers du module)

## Contrats
- Entrées : données lues (requêtes Sanity, routes du moteur, props), avec leurs types (`core/contracts/...`).
- Sorties : server actions, routes exposées, événements, composants exportés.
- Dépend de : modules et contrats utilisés. Utilisé par : …

## Comportement
États, règles métier reprises du LLM context Figma (citer le code d'écran), cas limites, messages affichés.

## Forces
Ce qui est solide et pourquoi (tests, invariants, simplicité).

## Faiblesses et limites connues
Ce qui manque, ce qui est approximatif, ce qui ne tiendrait pas à l'échelle. Honnête.

## Points sensibles
Sécurité (jetons, droits, injections), intégrité des données (brouillons, publication), IA (coût, garde-fous).
Ce qu'il ne faut JAMAIS faire dans ce module.

## Pièges
Comportements surprenants rencontrés (Next 16, Sanity, stega, HMR…), avec la parade.

## Comment modifier
Recettes courtes : « ajouter un champ », « ajouter un état », « changer un libellé »… avec les fichiers à toucher.

## Tests
Commande, ce qui est couvert, ce qui ne l'est pas, comment vérifier à la main (route, rôle, données).

## Décisions et « À trancher »
Décisions prises (et par qui), questions ouvertes du Figma qui touchent le module.

## Demandes de contrat
Changements souhaités dans `core/contracts/` ou dans un module d'un autre propriétaire (vide si aucun).
```
