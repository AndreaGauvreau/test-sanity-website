# Menu item

> Figma « Kuartz — Carte système » (`wvr98llwHnMufQ88qUp4Ih`) › 🎨 Design System › Components — Navigation — nœud `332:585` (COMPONENT_SET, 5 variantes, cadre 1152×76)

## Rôle

Élément de menu (28 px). Propriétés : Label, Show icon, Icon, Show shortcut. selected = coche à droite.

## Propriétés

| Propriété | Type | Défaut | Valeurs / préférences |
|---|---|---|---|
| `Label` | TEXT | `Date added` |  |
| `Show icon` | BOOLEAN | `false` |  |
| `Icon` | INSTANCE_SWAP | `Icon/calendar` | préférées : toutes les icônes Icon/* (73/75) sauf Icon/open, Icon/claude |
| `Show shortcut` | BOOLEAN | `false` |  |
| `state` | VARIANT | `default` | `default`, `hover`, `selected`, `disabled`, `danger` |

## Variantes et états

- `state` : default, hover, selected, disabled, danger (défaut : default)

Variantes présentes (5) : `state=default` · `state=hover` · `state=selected` · `state=disabled` · `state=danger`

## Anatomie — variante par défaut `state=default`

- **COMPONENT** `state=default` — taille: 208×28 · dim: W fixed / H fixed · layout: H gap 8{space/8} pad 0 8{space/8} align min/center strokes-in-layout · rayon: 5{radius/sm} · clip: oui · modes: Icon color=default
  - **INSTANCE** `icon` — taille: 16×16 · visible: masqué · dim: W fixed / H fixed · instance: Icon/calendar {size=18} · refs: visible←Show icon, mainComponent←Icon
  - **TEXT** `label` — taille: 172×16 · dim: W fill / H hug · fond: #cccccc {text/secondary} · texte: "Date added" · style: Body · textopt: resize height · refs: characters←Label
  - **INSTANCE** `shortcut` — taille: 35×16 · visible: masqué · dim: W hug / H hug · layout: H gap 0 pad 1 5 align center/center strokes-in-layout · minmax: minWidth 18 · rayon: 5{radius/sm} · fond: #212121 {bg/subtle} · contour: #252525 {border/default} · 1px inside · clip: oui · instance: Kbd · props: Label="⌘ ↵" · textes: "⌘ ↵" · refs: visible←Show shortcut
  - **INSTANCE** `check` — taille: 12×12 · dim: W fixed / H fixed · opacite: 0 · instance: Icon/check {size=12}

## Différences des autres variantes

Chaque variante est comparée à une variante de référence (la variante par défaut, ou la même combinaison avec une seule propriété ramenée à sa valeur par défaut — de préférence l'état). Clé = chemin du calque depuis la racine ; seules les propriétés qui changent sont listées (`+` calque ajouté, `−` calque absent).

### `state=hover`

- ~ `(racine)` — modes: Icon color=active · fond: #212121 {bg/subtle}
- ~ `/label` — fond: #ffffff {text/primary}

### `state=selected`

- ~ `(racine)` — modes: Icon color=active
- ~ `/label` — fond: #ffffff {text/primary}
- ~ `/shortcut` — textes: (aucun)
- ~ `/check` — opacite: (aucun)

### `state=disabled`

- ~ `(racine)` — modes: Icon color=disabled
- ~ `/label` — fond: #555555 {text/disabled}
- ~ `/shortcut` — textes: (aucun)

### `state=danger`

- ~ `(racine)` — modes: Icon color=danger
- ~ `/label` — fond: #ee4444 {interactive/danger}
- ~ `/shortcut` — textes: (aucun)

## Tokens et ressources utilisés

- Variables : `bg/subtle`, `border/default`, `interactive/danger`, `radius/sm`, `space/8`, `text/disabled`, `text/primary`, `text/secondary`
- Styles de texte : Body
- Effets : —
- Icônes : Icon/calendar, Icon/check
- Composants imbriqués : Kbd

## Capture

![Menu item](./MenuItem.png)
