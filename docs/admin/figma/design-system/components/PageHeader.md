# Page header

> Figma « Kuartz — Carte système » (`wvr98llwHnMufQ88qUp4Ih`) › 🎨 Design System › Components — Navigation — nœud `333:1416` (COMPONENT, cadre 880×24)

## Rôle

En-tête d'écran. Propriétés : Title, Meta, Show meta, Description, Show description.

## Propriétés

| Propriété | Type | Défaut | Valeurs / préférences |
|---|---|---|---|
| `Title` | TEXT | `Media` |  |
| `Meta` | TEXT | `48 files · 312 MB` |  |
| `Show meta` | BOOLEAN | `true` |  |
| `Description` | TEXT | `Images, videos and files used on the site. A file that is in use cannot be deleted.` |  |
| `Show description` | BOOLEAN | `false` |  |

## Anatomie — composant

- **COMPONENT** `Page header` — taille: 880×24 · dim: W fixed / H hug · layout: V gap 4{space/4} pad 0 align min/min strokes-in-layout · clip: oui
  - **FRAME** `title-row` — taille: 173×24 · dim: W hug / H hug · layout: H gap 10{space/10} pad 0 align min/baseline strokes-in-layout · clip: oui
    - **TEXT** `title` — taille: 60×24 · dim: W hug / H hug · fond: #ffffff {text/primary} · texte: "Media" · style: Heading 3 · textopt: resize width_and_height · refs: characters←Title
    - **TEXT** `meta` — taille: 103×16 · dim: W hug / H hug · fond: #666666 {text/muted} · texte: "48 files · 312 MB" · style: Body · textopt: resize width_and_height · refs: visible←Show meta, characters←Meta
  - **TEXT** `description` — taille: 880×15 · visible: masqué · dim: W fixed / H fixed · fond: #999999 {text/tertiary} · texte: "Images, videos and files used on the site. A file that is in use cannot be deleted." · style: Body Small · textopt: resize height · refs: visible←Show description, characters←Description

## Tokens et ressources utilisés

- Variables : `space/10`, `space/4`, `text/muted`, `text/primary`, `text/tertiary`
- Styles de texte : Heading 3, Body, Body Small
- Effets : —
- Icônes : —
- Composants imbriqués : —

## Capture

![Page header](./PageHeader.png)

_Capture du cadre de documentation `group/Page header` (`333:1408`, 880×97 px : titre, description et composant entier). La capture du composant seul (880×24 px) pesait 2339 octets (< 5 Ko), rendu 1× identique._
