# Tab

> Figma « Kuartz — Carte système » (`wvr98llwHnMufQ88qUp4Ih`) › 🎨 Design System › Components — Navigation — nœud `332:459` (COMPONENT_SET, 3 variantes, cadre 249×82)

## Rôle

Onglet. Propriété : Label.

## Propriétés

| Propriété | Type | Défaut | Valeurs / préférences |
|---|---|---|---|
| `Label` | TEXT | `Content` |  |
| `state` | VARIANT | `default` | `default`, `hover`, `active` |

## Variantes et états

- `state` : default, hover, active (défaut : default)

Variantes présentes (3) : `state=default` · `state=hover` · `state=active`

## Anatomie — variante par défaut `state=default`

- **COMPONENT** `state=default` — taille: 51×34 · dim: W hug / H hug · layout: V gap 8{space/8} pad 8{space/8} 0 0 0 align min/center strokes-in-layout · clip: oui
  - **TEXT** `label` — taille: 51×16 · dim: W hug / H hug · fond: #999999 {text/tertiary} · texte: "Content" · style: Body · textopt: resize width_and_height · refs: characters←Label
  - **RECTANGLE** `underline` — taille: 51×2 · dim: W fill / H fixed

## Différences des autres variantes

Chaque variante est comparée à une variante de référence (la variante par défaut, ou la même combinaison avec une seule propriété ramenée à sa valeur par défaut — de préférence l'état). Clé = chemin du calque depuis la racine ; seules les propriétés qui changent sont listées (`+` calque ajouté, `−` calque absent).

### `state=hover`

- ~ `/label` — fond: #ffffff {text/primary}

### `state=active`

- ~ `/label` — fond: #ffffff {text/primary}
- ~ `/underline` — fond: #ffffff {text/primary}

## Tokens et ressources utilisés

- Variables : `space/8`, `text/primary`, `text/tertiary`
- Styles de texte : Body
- Effets : —
- Icônes : —
- Composants imbriqués : —

## Capture

![Tab](./Tab.png)

_Capture du cadre de documentation `group/Tabs` (`332:444`, 1032×235 px : titre, description et composant entier) — ce cadre contient aussi les composants voisins de la même rubrique. La capture du composant seul (249×82 px) pesait 1895 octets (< 5 Ko), rendu 1× identique._
