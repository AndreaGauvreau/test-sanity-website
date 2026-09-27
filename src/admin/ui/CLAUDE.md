# Kit UI de l'admin (fondations) — LLM context

> Propriétaires : ui-foundations (fondations, Actions, Feedback, Forms, Avatar) · ui-composites (Data display, Navigation, Overlays, Model usage — section « Composites » en bas) · Figma : Design System « Kuartz — Carte système »
> (`docs/admin/figma/design-system/`, fiches `components/<Nom>.md` + `.png`) · Galerie : `/admin/kit` · Mis à jour : 2026-09-27

## Utilité

Le kit du Design System pour toutes les features de l'admin : tokens `--k-*`, reset scopé, polices, 75 icônes duotone,
préréglages de mouvement, primitive flottante (Popover + Portal) et les familles Actions, Feedback, Forms + Avatar.
Thème sombre uniquement exposé. Textes d'interface en anglais. Ne contient AUCUNE logique métier (pas de Sanity, pas de
moteur) : les features câblent les callbacks (`onFile`, `onPublish`, `onValueChange`…).
Pas à ce module : Rich text field (cms-media), Script dialog (code-usage), AI editor (sauf Model usage) / Ask AI panel
(agents de l'éditeur), Kuartz hub. Data display, Navigation, Overlays et Model usage : section « Composites » ci-dessous.

## Mise en place (layout de l'admin, propriété de shell)

```tsx
import { adminFontClassName } from '@/admin/ui/fonts'
import '@/admin/ui/tokens.css'
import '@/admin/ui/base.css'
// …
<div data-kz-admin="" data-theme="dark" className={adminFontClassName}>
  <ToastProvider>{children}</ToastProvider>
</div>
```
- `data-kz-admin` + la classe des polices sur LE MÊME élément (tokens.css résout `--k-font-inter` à cet endroit).
- `:root` n'est jamais touché : le site partage le document. Le CSS du kit ne s'importe que sous `src/app/admin/`.
- `ToastProvider` une seule fois (coque). Les portails (Popover, Tooltip, Select, Toast) se montent dans le premier
  `[data-kz-admin]` du document (sinon `<body>`, sans tokens !) ; `PortalContainerProvider` pour en imposer un autre.
- `src/app/admin/kit/layout.tsx` fait exactement cela pour la galerie (en attendant le layout de shell).

## Fichiers

- `tokens.css` — tokens Figma recopiés (primitives, sémantiques Dark sur `[data-kz-admin]` et `[data-theme="dark"]`, Light
  sous `[data-theme="light"]` fourni tel quel mais non exposé, styles de texte `--k-text-<style>` + `-tracking`, élévations,
  modes `[data-icon-color]` en spécificité (0,1,0)) + dérivés du kit (`--k-control-height`, `--k-z-*`, `--k-ease-*`, `--k-duration-*`).
- `base.css` — reset et base sous `:where([data-kz-admin])` (spécificité nulle) : box-sizing, police Body, fond bg/app,
  sélection, barres de défilement sombres, focus-visible commun (2 px border/focus), placeholder, liens (`a[data-kz-link]`),
  boutons, `.kz-visually-hidden`, filet de sécurité prefers-reduced-motion.
- `fonts.ts` — Inter 500/600/700 + Geist Mono 400 (next/font/google), `adminFontClassName`. Pas réexporté par `index.ts`.
- `motion-presets.ts` — valeurs pures (durées, courbes, ressorts, transitions, variantes) importables côté serveur.
- `motion.ts` (client) — réexporte les préréglages + `motion`, `AnimatePresence`, `MotionConfig`, `useReducedMotion`,
  `useMotionVariants`, `useMotionTransition`.
- `icons/generate.mjs` → `icons/icons.generated.ts` (données des tracés, `ICON_NAMES`, `IconName`) ; `icons/Icon.tsx`, `types.ts`.
- `utils/` — `cx`, `mergeRefs`/`assignRef`, `useControllableState`, `shortcut.ts` (`useShortcut`, `useShortcutLabel`, `shortcutLabel`…).
- `Popover/` — `Popover.tsx`, `Portal.tsx`, `position.ts` (calcul pur, testé).
- `OptionList/` — liste `role="listbox"` au style Menu (Select, VariableInput, et réutilisable par ui-composites) + `options.ts` (navigation pure).
- `Field/` — gabarit libellé / contrôle / aide / erreur (stacked, inline).
- Un dossier par composant : `Nom.tsx`, `Nom.module.css`, `index.ts`, `Nom.test.tsx` quand interactif.
- `index.ts` — exports publics (une section réservée à ui-composites en bas).

## Catalogue

| Composant | Rôle | Props clés | Figma |
|---|---|---|---|
| `Icon` | Icône duotone currentColor | `name: IconName`, `size` 10/12/16/18/20, `set` 12/18, `title`, `spin` | icons/README.md |
| `Button` | Action | `variant` primary/secondary/subtle/ghost/danger, `size` medium/small, `iconLeft`, `iconRight`, `loading`, `block` ; `buttonClassName()` + `ButtonContent` pour un lien | Button.md |
| `IconButton` | Action à icône seule (+ Tooltip) | `icon`, `label` (obligatoire), `variant` ghost/secondary/primary, `size` small/xsmall, `pressed`, `tooltip`, `shortcut`, `loading` | IconButton.md |
| `Chip` | Bascule | `icon`, `pressed`/`defaultPressed`/`onPressedChange` | Chip.md |
| `Tag` | Statut court | `tone` neutral/info/success/warning/error/inverse, `dot`, `icon` | Tag.md |
| `Kbd` | Touche | `children` | Kbd.md |
| `Tooltip` | Infobulle | `label`, `shortcut`, `placement`, `delay` (500), `open`/`defaultOpen`/`onOpenChange`, `disabled` ; un seul enfant focalisable | Tooltip.md |
| `ProgressBar` | Jauge | `value` 0-100 (absent = indéterminé), `tone` primary/danger, `label` | ProgressBar.md |
| `Callout` | Note | `tone` neutral/info/success/warning/error, `action`, `icon` | Callout.md |
| `Toast` / `ToastProvider` / `useToast()` | Notifications | `show({ type, message, action, duration, id })`, `update(id, patch)`, `dismiss`, `clear` | Toast.md |
| `EmptyState` | État vide | `title`, `description`, `icon`, `action`, `headingLevel` | EmptyState.md |
| `PublishButton` | Bouton Publish (visuel) | `state: PublishState` (contrat ; `failed` = « error » du Figma), `onPublish`, `onRetry`, `pendingCount` | PublishButton.md |
| `Field` | Gabarit de champ | `label`, `hideLabel`, `htmlFor`/`labelId`, `helper`, `error`, `helperId`, `layout`, `helperClassName` | Input.md |
| `Input` | Champ texte | props `<input>` + `label`, `hideLabel`, `helper`, `error` (message ou `true`), `layout`, `icon`, `suffix`, `showCount` | Input.md |
| `Textarea` | Multiligne 88 px | props `<textarea>` + mêmes que Input (sans icône) | Textarea.md |
| `Select` | Liste déroulante | `options: ListItems` (options ou groupes ; `icon`, `meta`, `depth`, `disabled`), `value`/`defaultValue`/`onValueChange`, `placeholder`, `name`, `renderValue`, `error` | Select.md |
| `SearchField` | Recherche | `value`/`defaultValue`/`onValueChange`, `shortcut` (défaut `/`, `false`), `onClear`, `label` | SearchField.md |
| `Checkbox` | Case | `label`, `checked`/`defaultChecked`/`onCheckedChange`, `indeterminate` | Checkbox.md |
| `RadioGroup` + `Radio` | Choix unique | groupe : `label`, `value`/`defaultValue`/`onValueChange`, `disabled`, `orientation` ; radio : `value`, `label` | Radio.md |
| `Switch` | Interrupteur | `label`, `checked`/`defaultChecked`/`onCheckedChange`, `name` | Switch.md |
| `SettingRow` | Réglage + Switch | `title`, `description`, `checked`…, `disabled`, `control` (autre contrôle) | SettingRow.md |
| `ImageUpload` | Envoi d'image | `onFile` (obligatoire), `value {src,name,size}`, `uploading {name,progress}`, `onRemove`, `onReject`, `accept`, `maxSize`, `hint`, `error`, `height` | ImageUpload.md |
| `CodeBlock` | Code | `value`/`defaultValue`/`onValueChange`, `readOnly`, `readOnlyNote`, `highlight`, `lineNumbers`, `minLines`, `error` ; `tokenizeCode()` | CodeBlock.md |
| `RemoveBadge` | Pastille ✕ 18 px | `label`, `corner` (coin haut droit du parent relatif) | RemoveBadge.md |
| `FaviconPreview` | Favicon dans un onglet | `theme` light/dark, `src`, `onFile`, `onRemove`, `label` | FaviconPreview.md |
| `ImagePreview` | Image 1200 × 630 | `src`, `alt`, `ratio`, `width`, `onRemove`, `emptyLabel` | ImagePreview.md |
| `VariableChip` | Champ CMS dans un texte | `name`, `label`, `invalid` | VariableChip.md |
| `VariableInput` | Texte + puces `{{champ}}` | `variables: {name,label,icon}[]`, `value`/`defaultValue`/`onValueChange` (texte avec `{{…}}`), `helper`, `error`, `name` ; `parseVariables`, `serializeVariables`, `variablesIn`, `resolveVariables` | VariableInput.md |
| `Avatar` | Avatar rond | `name`, `initials`, `src`, `size` 20/28/40, `tone` blue/green/neutral, `decorative` ; `initialsOf()` | Avatar.md |
| `Popover` + `Portal` | Primitive flottante | `open`, `onClose(reason)`, `anchorRef`, `placement`, `offset`, `matchAnchorWidth`, `closeOnEscape`, `closeOnOutsideClick`, `closeOnFocusOut`, `initialFocus` panel/first/none, `returnFocus`, `inert`, `instant`, `surface` | Menu.md (surface) |
| `OptionList` | Listbox au style Menu | `items`, `activeIndex`/`onActiveIndexChange`, `selected`, `onSelect`, `optionId`, `focusable`, `onKeyDown` | Menu.md, MenuItem.md |

## Conventions

- CSS Modules + `var(--k-*)` uniquement (aucune couleur en dur, sauf l'illustration du navigateur de FaviconPreview et les
  ombres du Remove badge, codées en dur dans Figma aussi). Styles de texte : `font: var(--k-text-body); letter-spacing: var(--k-text-body-tracking);`.
- Couleur d'icône : le composant pose `--k-icon-current` (ou `data-icon-color="…"` sur un parent) ; `<Icon>` lit `color: var(--k-icon-current)`.
- Jeu d'icônes : les fiches Figma posent souvent le jeu **18** réduit (Button small 12, Chip 12, Tag 10, Input 16) : `set={18}`.
  Le jeu 12 sert à Checkbox (coche), Menu item (coche), CodeBlock (cadenas).
- API : props contrôlées ou non (`value`/`defaultValue`/`onValueChange`, `checked`…, `pressed`…) via `useControllableState` ;
  `ref` en prop (React 19) ; `className` transmis à la racine ; autres props HTML étalées sur l'élément natif principal.
- Composants purs (sans hook) : Button, Tag, Kbd, Callout, EmptyState, ProgressBar, RemoveBadge, ImagePreview, VariableChip, Field, Icon
  → utilisables tels quels dans un Server Component. Les autres sont `'use client'`.
- Pas d'import Next dans les composants (sauf `fonts.ts`) : images en `<img>` (le kit ne connaît pas next/image).

## Mouvement (skills web-animation-design + motion)

- Survol / couleur : CSS `ease` 150 ms (`--k-duration-fast`). Pression : `scale(0.98)` (Button), `0.96` (IconButton), `0.94` (Remove badge).
- Entrées / sorties : `popIn` (0.96 → 1, 150 ms ease-out-quint, origine = ancre via `--k-popover-origin`), `slideUp` (toast, 250 ms),
  `fade`, `slideDown`, `list` + `listItem` (échelonnement 30 ms). Sortie ≈ 80 % de l'entrée. Ressorts sans rebond (`spring.snappy`).
- Rien au clavier : Select ouvert au clavier = `instant` ; tooltips suivants instantanés (fenêtre « chaude » de 400 ms) ; défilement de liste sans animation.
- Mouvement réduit : chaque module CSS a son `@media (prefers-reduced-motion: reduce)` + filet global dans base.css ;
  en JS, `useMotionVariants()` / `useMotionTransition()` renvoient des transitions nulles. Loader : rotation coupée.

## Accessibilité

- Focus visible partout (2 px border/focus, décalage 2) ; champs : la bordure devient border/focus (Figma « focused »).
- Select : motif APG « combobox select-only » (focus sur le champ, `aria-activedescendant`, ↑ ↓ Home End PageUp PageDown,
  Entrée/Espace, Échap, Tab choisit, recherche par lettres, `aria-invalid`, `aria-describedby`, champ caché `name`).
- Tooltip : `role="tooltip"`, `aria-describedby` (omis si le texte est déjà le nom accessible, cas IconButton), clavier sans délai, Échap.
- Popover : pile de couches (Échap ne ferme que la plus haute), clic extérieur, retour du focus à l'ancre.
- Checkbox / Radio : inputs natifs (Espace, flèches, formulaires) ; Switch : `role="switch"` nommé par un `<label>` englobant.
- Toast : région « Notifications », `aria-live="polite"`, erreurs en `role="alert"`, minuteur suspendu au survol et au focus.
- PublishButton : état annoncé dans une zone `role="status"` masquée ; `aria-busy` pendant la publication.
- ImageUpload : zone = bouton (Entrée/Espace pour parcourir), refus annoncés en `role="alert"`, progression en `role="status"`.
- VariableInput : `role="textbox"` contentEditable, `aria-autocomplete="list"`, liste d'insertion au clavier.

## Forces

- Valeurs Figma reprises au pixel (tailles mesurées dans la galerie : Button 37/39, Input 34, Select 34, Tag 16, Kbd 16, Tooltip 25,
  Toast 45, Switch 32×18, Setting row 58, Image upload 213/250, Favicon 180×147, Variable input 360×77 — voir la fiche de chaque composant).
- Tokens scopés : aucune fuite vers le site ; resets en `:where()` (jamais de conflit de spécificité avec les modules).
- 71 tests jsdom (clavier, ARIA, états) + calculs purs testés (position, icônes, sérialisation `{{…}}`, coloration).
- Icônes générées et vérifiées contre les SVG sources (un test échoue si un SVG est ajouté sans régénérer).

## Faiblesses et limites connues

- Contrastes Figma sous AA pour certains textes secondaires : text/muted #666 sur #000/#1f1f1f (≈ 3,7:1 / 3,0:1 : aides,
  placeholders, compteurs) ; Kbd quasi invisible dans un Search field (bg/subtle sur bg/input). Gardés tels quels (fidélité au Figma).
- Écarts assumés au Figma : Chip « on » garde son contour (couleur du fond) → 66×25 au lieu de 64×23 (pas de saut à la bascule) ;
  Search field « filled » reste à 30 px (le ✕ déborde de 2 px) au lieu de 34 ; Callout et Setting row fluides (400 / 560 px dans Figma).
- FaviconPreview : le navigateur est redessiné en CSS (le Figma utilise une capture) ; onglets voisins neutres (pas de logos tiers).
- CodeBlock : coloration minimale (balises, accolades, `{{…}}`), pas d'éditeur complet (pas d'indentation automatique, Tab ne s'insère pas).
- VariableInput : contentEditable maison — une seule ligne, collage en texte brut, pas d'annulation fine (Ctrl+Z natif seulement
  sur la frappe) ; la position du curseur est restaurée par décompte de caractères après transformation d'un `{{champ}}` tapé.
- Hover / pressed ne se montrent pas en statique dans la galerie (états CSS vivants) ; pas de prop pour les forcer.
- Le thème Light (inachevé dans Figma) n'est ni testé ni exposé.

## Points sensibles

- Ne jamais poser les tokens sur `:root` ni importer `tokens.css`/`base.css` hors de `src/app/admin/`.
- Un portail hors de `[data-kz-admin]` perd les tokens et les polices : garder un conteneur admin dans la page.
- `CodeBlock` n'exécute rien et n'injecte jamais de HTML (rendu par nœuds texte React) ; `VariableInput` construit ses puces
  avec `textContent` (jamais `innerHTML`) : garder ces deux règles (textes venant du CMS).
- `ImageUpload` ne vérifie que le type MIME annoncé et la taille : la vraie validation se fait côté serveur (features).
- Grammaire `{{nom}}` alignée sur le site (`src/lib/template-variables.ts`, site-adapter) : `[A-Za-z_][A-Za-z0-9_]*`.
  La changer des deux côtés à la fois ; le site échappe les valeurs selon le contexte, pas le kit.

## Pièges

- `motion.ts` est client : importer les VALEURS depuis `motion-presets.ts` (ou `@/admin/ui`) dans un Server Component, pas depuis `@/admin/ui/motion`.
- `fonts.ts` n'est pas dans le barrel : `next/font` ne tourne pas sous Vitest.
- Portail monté un rendu après son parent : `Popover` relance son placement quand le panneau apparaît (état `panel`) ; ne pas
  revenir à un simple `useRef` (placement nul pour un popover ouvert d'emblée).
- `mergeRefs` recrée un callback à chaque rendu : le mémoïser quand il pose un état (voir `setRefs` dans Popover).
- Les tooltips partagent un état de module (« chaud ») : en test, avancer l'horloge (`vi.setSystemTime`) entre deux cas.
- Tests de toasts / exits : `MotionGlobalConfig.skipAnimations = true` (sinon l'exit ne se termine pas sous minuteurs simulés).
- Une image cassée rendue par le serveur déclenche `onError` avant l'hydratation : Avatar relit `complete/naturalWidth` au montage.
- `LayoutProps<'/admin/kit'>` peut échouer au typage quand `.next/types` (build) est en retard sur `.next/dev/types` : props typées à la main.

## Comment modifier

- **Nouvelle icône** : l'exporter du Figma dans `docs/admin/figma/design-system/icons/` (+ `12/`), puis
  `node src/admin/ui/icons/generate.mjs` ; `IconName` s'étend tout seul. Mettre à jour le test du nombre (75).
- **Nouveau token** : l'ajouter dans `tokens.css` (bloc Dark ET Light) avec le nom `--k-<chemin Figma>`.
- **Nouvelle variante de Button** : classe dans `Button.module.css` (fond, `--k-icon-current`, états `:hover`/`:active` avec
  `:not(:disabled, [data-loading])`), union `ButtonVariant`, ligne dans la galerie.
- **Nouveau composant** : dossier `Nom/` (`Nom.tsx`, `Nom.module.css`, `index.ts`, test si interactif), export dans `index.ts`,
  section dans `src/app/admin/kit/sections/*` + lien dans `NAV` (KitGallery.tsx).
- **Liste flottante sur mesure (ui-composites : Menu, FilterPopover…)** : `Popover` (+ `OptionList` pour une liste de choix) ;
  surface standard avec `surface` (défaut), `initialFocus="first"` pour un menu, `closeOnFocusOut` pour une liste.
- **Galerie** : ui-composites remplace `src/app/admin/kit/sections/Composites.tsx` et complète `NAV`.

## Tests

- `npx vitest run src/admin/ui` — 99 tests (jsdom) : Button, Icon (+ fidélité aux SVG), position, Popover, Tooltip, Select,
  Chip, Switch + SettingRow, Checkbox + RadioGroup, SearchField + Input, ImageUpload, Toast, PublishButton, CodeBlock, VariableInput, Avatar ;
  composites : Modal, Drawer, Tabs, Menu, SegmentedControl, StatusSelect, CMSCell.
- `npx tsc --noEmit -p .` — zéro erreur dans `src/admin/ui` et `src/app/admin/kit`.
- À la main : `http://127.0.0.1:4040/admin/kit` (dev seulement) — survol, Tab, clavier dans Select / VariableInput, toasts,
  glisser-déposer d'une image ; `prefers-reduced-motion` dans les outils du navigateur.

## Décisions et « À trancher »

- Thème : sombre seul exposé ; Light livré dans les tokens tel que le Figma (inachevé).
- `PublishButton` suit le contrat `PublishState` (`failed`) plutôt que le nom Figma `error`.
- La galerie est sous `src/app/admin/kit/` (route `/admin/kit`, table des routes de l'architecture) et non `_kit/` (AGENTS-PLAN).
- Toast : durée 5 s (6 s pour une erreur), `loading` permanent jusqu'à `update`, 3 visibles au plus, le plus récent en bas.

## Demandes de contrat

- **shell** (`src/app/admin/layout.tsx`) : poser `data-kz-admin` + `data-theme="dark"` + `adminFontClassName` sur un même élément,
  importer `@/admin/ui/tokens.css` puis `@/admin/ui/base.css`, et monter `<ToastProvider>` une fois pour tout l'admin.
- **orchestrateur** : AGENTS-PLAN cite `src/app/admin/_kit/` ; l'architecture et la consigne donnent `/admin/kit` (retenu).


---

# Composites (ui-composites) — LLM context

> Propriétaire : ui-composites · Construits SUR les fondations ci-dessus (Button, IconButton, Icon, Tag, Checkbox, Select,
> Tooltip, Popover, motion-presets) sans les dupliquer · Galerie : `/admin/kit` (familles « Data display — composites »,
> « Navigation », « Overlays », « AI editor ») · Mis à jour : 2026-09-27

## Catalogue

Un dossier par composant (`Nom.tsx`, `Nom.module.css`, `index.ts`, test si interactif). Tout est exporté par `@/admin/ui`.
« pur » = sans hook, utilisable dans un Server Component ; sinon `'use client'`.

### Data display

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `ListItem` (pur) | Ligne de liste 47 px | `title`, `subtitle`, `meta`, `tag`, `avatar` (nœud) ou `icon`, `action` (nœud), `href` / `onClick` (lien étiré, l'action reste au-dessus) | ListItem.md |
| `Table`, `TableRow`, `TableHeaderCell`, `TableCell` (purs) | Tableau simple (Team, Code, Versions) | ligne : `selected`, `hover` ; en-tête : `width`, `sort` ascending/descending/none + `onSort` (bouton, `aria-sort`), `align` ; cellule : `type` text/title/tag/user/actions/model/checkbox, `thumbnail`, `icon`, `avatar` | TableCell.md |
| `MediaCard` | Carte média 184 px | `name`, `size`, `usage`, `usagePlaces` (→ Usage tooltip), `usageTitle`, `type` image/video/file, `typeLabel`, `src`, `selected`/`defaultSelected`/`onSelectedChange`, `selectable`, `onOpen`, `badge` (LockBadge) | MediaCard.md |
| `VersionItem` (pur) | Ligne de version 36 px (bouton) | `label`, `status` live/failed, `tag`, `selected` (aria-current) | VersionItem.md |
| `DetailRow` (pur) | Libellé / valeur (`<dl>`) | `label`, `value`, `layout` stacked/inline (libellé 120) | DetailRow.md |
| `StatCard` (pur) | Chiffre clé | `label`, `value`, `hint`, `icon` | StatCard.md |
| `AIUsage` | Consommation IA par période | `period`/`defaultPeriod`/`onPeriodChange` (`month`, `3-months`, `all-time` ; `AI_USAGE_PERIODS`), `totals {inputTokens, outputTokens, costUsd} \| null`, `features [{label, usage}]`, `note`, `loading` | AIUsage.md |
| `SearchPreview` (pur) | Aperçu Google (max 560) | `siteName`, `url`, `title`, `description` (2 lignes), `favicon` | SearchPreview.md |
| `SocialPreview` (pur) | Aperçu OG (max 400) | `domain`, `title`, `description`, `image` (1200/630) | SocialPreview.md |
| `HeadingRow` (pur) | Ligne de l'arbre des titres | `level` 1-6 (retrait 8 + 16/niveau), `text`, `status` ok/warning, `note`, `as` div/li | HeadingRow.md |
| `LockBadge` | Cadenas 24 px + infobulle | `label` (raison, nom accessible), `placement` (right), `corner` | LockBadge.md |
| `StatusSelect` | Statut CMS + menu d'actions | `status` live/draft/changed, `label`, `actions` (défaut `DEFAULT_STATUS_ACTIONS` : Unpublish / Delete draft / Discard changes ; `[]` = pastille seule), `onAction(id)`, `disabled` | StatusSelect.md |
| `CMSTable`, `CMSRow`, `CMSCell` + `CMS_COLUMN_WIDTHS` | Tableau façon tableur (C3) | table : `aria-label`, `role` (table ; grid si la feature gère les flèches) ; ligne : `header`, `selected`, `onOpen` + `openLabel` (Row open) ; cellule : `type` header/handle/text/title/status/image, `width`, `src`, `checked`/`indeterminate`/`onCheckedChange`/`checkboxLabel`, `grip`, `editing` + `editValue`/`onCommit`/`onCancel`/`onEditRequest`/`inputLabel` | CMSCell.md |
| `RowOpen` | Bouton « ouvrir » sur fondu (120 × 44) | `onOpen`, `label` ; sticky à droite dans une ligne `[data-row]` | RowOpen.md |

### Navigation

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `NavItem` (pur) | Entrée de sidebar 32 px | `label`, `icon`, `count`, `tag`, `active` (aria-current), `href` + `as` (next/link), `depth` 0/1, `expanded` + `onExpandedChange` (chevron = bouton séparé), `expandLabel`, `wrapperClassName` | NavItem.md |
| `NavSection` (pur) | Titre de section | `label`, `action`, `labelId` | NavSection.md |
| `Tabs`, `Tab`, `TabPanel`, `tabId()`, `tabPanelId()` | Onglets | `items [{value, label, disabled, href}]`, `value`/`defaultValue`/`onValueChange`, `activation` automatic/manual, `idBase`, `linkAs` ; tous les items avec `href` → `<nav>` de liens (aria-current) | Tab.md, Tabs.md |
| `SegmentedControl`, `Segment` | Choix unique compact | `items [{value, label, icon, disabled, shortcut}]`, `value`/`defaultValue`/`onValueChange`, `aria-label`, `disabled` ; segment à icône = infobulle | Segment.md, SegmentedControl.md |
| `Menu`, `MenuPanel`, `MenuItem`, `MenuGroup`, `MenuSeparator` | Menu (APG menu button) | menu : `trigger` (élément bouton), `open`/`defaultOpen`/`onOpenChange(open, reason)`, `placement`, `width` (216), `aria-label` ; panneau : `initialFocus` first/last/none, `width` ; élément : `icon`, `shortcut`, `selected` (+ `multiple`), `disabled`, `danger`, `href`, `onSelect(event)` (`preventDefault()` = reste ouvert), `keepOpen` | MenuItem.md, Menu.md |
| `Sidebar` | Sidebar 240 px (présentationnelle) | `site {name, domain, screen, logo}`, `sections [{id, label, action, items}]` (item : `id, label, icon, href, onClick, active, count, tag, children, defaultExpanded`), `user {name, role, avatar, initials, tone}`, `onAskAI`, `onLogout` ou `logout` (nœud), `hub {href, label}`, `linkAs`, `expanded`/`onExpandedChange` | Sidebar.md |
| `TopBar` (pur) + `topBarStatusText()` | Barre du haut 48 px | `state: PublishState`, `pendingCount`, `statusText`, `reviewHref`/`onReview`, `autosaveText` (null = masqué), `siteUrl` (View site ↗), `publish` (slot PublishButton), `linkAs` | TopBar.md |
| `PageHeader` (pur) | En-tête d'écran (h1) | `title`, `meta`, `description`, `actions` (gap 12), `tools` (toolbar, gap 4), `toolsLabel`, `tabs`, `headingLevel` | PageHeader.md |
| `SectionHeader` (pur) | Titre de section (h2) | `title`, `description`, `action`, `headingLevel`, `titleId` | SectionHeader.md |
| `ContentArea` (pur) | Zone de contenu de la coque | `gap` 16/20/24, `padding` default (28 40 40) / tabs (24 40), `width` default (1 120 utiles) / full, `as` | écrans B1, C3, C5 |

### Overlays

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `Scrim` | Voile bg/scrim | `position` fixed/absolute, `enterDuration`, `onClick` | Scrim.md |
| `Modal` (+ `useModalDialog`, `focusableIn`) | Fenêtre modale 480 | `open`, `onClose(reason: escape/scrim/close/cancel)`, `title`, `description`, `children`, `footer` ou `onConfirm` + `confirmLabel`/`cancelLabel`/`confirmLoading`/`confirmDisabled`, `tone` default/destructive (alertdialog), `width`, `closeOnScrimClick`, `hideClose`, `initialFocusRef` | Modal.md |
| `Drawer` | Panneau latéral 810 | `open`, `onClose(reason: escape/scrim/close)`, `title`, `status`, `actions`, `children`, `footer`, `width` (810), `closeOnScrimClick`, `initialFocusRef` | Drawer.md, écran C4 |
| `FilterPopover` + `DEFAULT_FILTER_OPERATORS` | Fenêtre de filtres 420 | `fields [{value, label, operators, options}]`, `conditions`/`defaultConditions`/`onConditionsChange` (`{id, field, operator, value}`), `trigger` ou `open` + `anchorRef`, `placement` (bottom-end), `title` | FilterPopover.md |
| `UsageTooltip` | Usage d'un média (300) | `title`, `places [{label, image, highlight {x,y,width,height} en fractions, href}]`, `children` (déclencheur), `open`…, `openDelay` 300, `closeDelay` 150, `viewLabel` | UsageTooltip.md |
| `SelectionBar` | Barre de sélection | `selectedCount`, `totalCount`, `onSelectAll(checked)`, `onClear`, `onDownload`, `deletableCount` + `onDelete` (allowed / partial / blocked déduits), `noun`/`nounSingular`, `children` | SelectionBar.md |

### AI editor (partagé)

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `ModelUsage` (pur) | Modèle + tokens + coût | `usage {model, inputTokens, outputTokens, costUsd, costKind}`, `model`, `size` default/small, `showModel`, `showUsage` ; formaté par `modelLabel`, `formatTokens`, `formatCost`, `formatUsageLine` (contrat) | ModelUsage.md |

## Conventions (en plus de celles des fondations)

- Mesures reprises des fiches et contrôlées dans la galerie (Chrome, 1 440 px) : List item 560 × 47, Tabs 35 (Tab 34), Segmented
  control 29 / 30 (icônes), Menu 216 (élément 206 × 28), Sidebar 240 × 900 (Nav item 223 × 32), Top bar 48, Page header 28 avec
  outils, Version item 380 × 36, Media card 184 × 163, Status select 54 × 19, CMS : en-tête 41 / ligne 45 (40 / 44 + trait),
  Selection bar 37, Heading row 24, AI usage 384 × 217, Filter popover 420 × 134, Usage tooltip 300 × 374, Drawer 810 × 900.
- Largeurs Figma « étirables » rendues fluides (ListItem, VersionItem, DetailRow, StatCard, AIUsage, Heading row) ; les fixes
  restent fixes (MediaCard 184, Menu 216, Sidebar 240, Filter popover 420, Usage tooltip 300, Modal 480, Drawer 810).
- Liens : le kit ne connaît pas next/link. `as` (NavItem, ContentArea), `linkAs` (Sidebar, Tabs, TopBar) acceptent le composant
  de lien de l'appelant. Liens externes (`View site`, `View`) : `target="_blank"` + `rel="noopener noreferrer"` + « (opens in a new tab) » masqué.
- Couches : Modal et Drawer à `z-index: var(--k-z-overlay, 900)` (sous les popovers 1000 et les toasts 1100 : un Select ou un Menu
  ouvert dans une Modal passe devant). Le token `--k-z-overlay` n'existe pas encore (voir Demandes de contrat) : repli 900.
- Pile de couches commune (`useLayer` / `isTopLayer` du Popover) : Modal, Drawer, Popover, Menu, Select… Échap ne ferme que la couche du dessus.

## Mouvement

- Modal : échelle 0.96 → 1 + fondu, 200 ms ease-out-quint (sortie 160 ms, vers 0.98) ; Scrim apparié (même durée, même courbe).
- Drawer : `translateX(100%) → 0`, 280 ms ease-out (sortie 224 ms) ; Scrim apparié (280 ms). `transform` en chaîne → WAAPI (skill motion), pas de will-change.
- Menu, FilterPopover, UsageTooltip, StatusSelect : `popIn` du Popover (0.96 → 1 depuis l'ancre, `--k-popover-origin`) ; un menu
  ouvert au clavier est instantané (`instant`).
- SelectionBar : `slideDown` à l'apparition (l'appelant l'enveloppe dans `<AnimatePresence>` pour la sortie).
- Survol / sélection (NavItem, Tab, Segment, VersionItem, lignes de tableau, Media card) : couleur `ease` 150 ms, sans mouvement ;
  chevrons : rotation 150 ms ease-in-out. Menu : aucune transition (navigation fréquente, focus déplacé par le pointeur).
- Mouvement réduit : `useReducedMotion` dans Modal / Drawer (fondu instantané), `useMotionTransition` (Scrim), `useMotionVariants`
  (SelectionBar, Popover) + `@media (prefers-reduced-motion: reduce)` dans chaque module qui a une transition. Vérifié en Chrome
  (`reducedMotion: 'reduce'`) : le Drawer est en place dès la première frame.

## Accessibilité

- Modal / Drawer : APG dialog modal (`role="dialog"` ou `alertdialog` en destructive, `aria-modal`, titre `aria-labelledby`,
  description `aria-describedby`), focus initial (`initialFocusRef` → `[data-autofocus]` → premier champ → la fenêtre), piège de Tab /
  Maj+Tab, Échap (couche du dessus seulement), clic sur le voile, retour du focus au déclencheur, défilement de la page verrouillé.
- Menu : APG menu button (aria-haspopup, aria-expanded, aria-controls), `role="menu"` nommé par le déclencheur, roving tabindex,
  ↑ ↓ en boucle, Home / End, première lettre, Entrée / Espace, Échap et Tab referment et rendent le focus ; `menuitemradio` /
  `menuitemcheckbox` avec `aria-checked` quand `selected` est défini ; éléments désactivés sautés ; `MenuGroup` = `role="group"` nommé.
- Tabs : APG tabs (tablist, aria-selected, aria-controls ↔ tabpanel, roving tabindex, ← → Home End, automatique ou manuel) ;
  onglets de route = `<nav>` de liens + `aria-current="page"` (pas de rôle tab pour une navigation).
- SegmentedControl : `radiogroup` + `radio` (aria-checked), roving tabindex, flèches qui sélectionnent ; segments à icône nommés + infobulle.
- Sidebar : `<aside>` + `<nav aria-label="Admin">`, listes nommées par leur Nav section, `aria-current="page"`, chevron = bouton
  `aria-expanded` distinct du lien.
- CMS : table / row / columnheader / cell par défaut ; édition sur place = `<input>` nommé (`inputLabel`), Entrée valide, Échap annule
  (sans fermer la fenêtre parente), clic ailleurs valide ; cases nommées (« Select … ») ; Row open nommé par l'élément.
- StatusSelect : bouton de menu nommé « Status: Live » (contient le libellé visible).
- LockBadge : `role="img"` focalisable, nom = raison, infobulle au survol et au focus. HeadingRow : « Heading level N: » lu, pastille masquée.
- UsageTooltip : fenêtre non modale (`role="dialog"`, contient des liens), déclencheur `aria-haspopup="dialog"` + `aria-expanded` ;
  clic ou ↓ → focus dans la fenêtre ; survol → s'ouvre sans prendre le focus.
- SelectionBar : `role="region"` « Selection », compte en `aria-live="polite"`, case « tout » cochée / mixte.
- ModelUsage : le texte visible est découpé pour la couleur ; la ligne complète (`formatUsageLine`) est lue une fois (texte masqué).

## Forces

- Tailles Figma retrouvées au pixel (voir Conventions) et rendu comparé aux écrans C3, C4, C5, B1 et aux planches Sidebar / Top bar.
- Aucune couleur en dur : tout passe par `--k-*` (le fondu du Row open utilise `color-mix` sur bg/input-hover).
- Réutilisation stricte des fondations : Menu et StatusSelect sur Popover, FilterPopover sur Popover + Select, UsageTooltip sur
  Popover + Button, Sidebar sur NavItem / NavSection / Button / IconButton / Avatar / Tag.
- 28 tests jsdom de plus (99 au total) : Modal, Drawer, Tabs, Menu, SegmentedControl, StatusSelect, CMSCell.

## Faiblesses et limites connues

- CMS : pas de navigation aux flèches entre cellules ni de glisser-déposer (la poignée est dessinée) : à la charge de la feature
  cms-media (passer `role="grid"` à CMSTable et gérer le focus des cellules). La poignée est décorative (`aria-hidden`).
- Modal / Drawer : le reste de la page n'est pas rendu `inert` (aria-modal + piège du focus seulement) ; un lecteur d'écran en
  navigation virtuelle peut encore lire l'arrière-plan sur certains couples navigateur / lecteur.
- Sidebar : le dépliage des pages listing n'est pas animé (entrée utilisée 100 fois par jour) ; les ids des sections viennent de `useId`.
- TopBar : le texte d'état n'est pas une zone live (PublishButton annonce déjà) ; « Draft saved automatically » est masqué sous 1 100 px.
- UsageTooltip : le cadre rouge est transparent (le Figma remplit la zone en #2b2b2b car sa capture est une maquette) ; les
  coordonnées du cadre sont des fractions de la miniature recadrée 278 × 124 (`object-fit: cover`) : à calculer sur la même découpe.
- AIUsage : la note par défaut est le texte du Figma ; pas de graphique (hors Figma).
- Contrastes Figma gardés (text/muted sur bg/elevated pour les méta, compteurs, notes : ≈ 3,4:1).

## Pièges

- `MenuItem.onSelect` : appeler `event.preventDefault()` garde le menu ouvert — ne pas appeler `preventDefault` avant l'action
  dans un gestionnaire clavier (bug corrigé : Entrée ne refermait plus le menu).
- `MenuPanel` prend `initialFocus`, pas `autoFocus` (conflit avec l'attribut HTML).
- `TableHeaderCell.align` remplace l'attribut HTML obsolète `align` (omis du type).
- Tests Modal / Drawer : le focus initial passe par `requestAnimationFrame` (portail monté un rendu plus tard) → attendre le focus
  (`waitFor`) avant de focaliser autre chose ; `MotionGlobalConfig.skipAnimations = true` pour les sorties.
- `RowOpen` dans une ligne `[data-row]` est `position: sticky` (collé au bord droit VISIBLE du tableau qui défile) avec
  `margin-left: -120px` : il doit rester le dernier enfant de la ligne (CMSRow le pose ainsi).
- `ModelUsage` importe `Usage` depuis `contracts/engine` (format.ts ne le réexporte pas).

## Recettes

```tsx
// Coque (shell) : Sidebar + TopBar + ContentArea
<Sidebar site={{ name, domain, screen: 'Overview' }} sections={sections} user={{ name, role: 'Kuartz', tone: 'blue' }}
  onAskAI={openAskAI} logout={<form action={logout}><IconButton type="submit" icon="logout" label="Log out" /></form>}
  hub={isKuartz ? { href: HUB_URL } : undefined} linkAs={Link} />
<TopBar state={publish.state} pendingCount={n} reviewHref="/admin/publish" siteUrl={siteUrl} linkAs={Link}
  publish={<PublishButton state={publish.state} onPublish={…} onRetry={…} />} />
<ContentArea gap={20}><PageHeader title="Blog" meta="12 posts" tools={<>…IconButtons…</>} />…</ContentArea>

// Page avec onglets de route (C1 / C2)
<PageHeader title="Home" meta="/" actions={<Button variant="secondary" size="small" iconLeft="ai">Open in AI editor</Button>}
  tabs={<Tabs aria-label="Page" value="seo" linkAs={Link} items={[{ value: 'content', label: 'Content', href }, { value: 'seo', label: 'SEO', href }]} />} />

// Menu d'actions
<Menu trigger={<IconButton icon="more" label="More actions" />} placement="bottom-end">
  <MenuItem icon="external" href={previewUrl} target="_blank">Preview</MenuItem>
  <MenuSeparator />
  <MenuItem icon="trash" danger onSelect={() => setConfirm(true)}>Delete</MenuItem>
</Menu>

// Confirmation destructive
<Modal open={confirm} onClose={() => setConfirm(false)} tone="destructive" title="Delete this post?"
  description="…" confirmLabel="Delete" onConfirm={remove} confirmLoading={pending} />

// Fiche CMS en panneau (C4) : l'URL pilote `open`
<Drawer open={!!id} onClose={() => router.push(listUrl)} title={doc.title} status={<Tag tone="warning" dot>Changed</Tag>}
  actions={<Menu …/>} footer={<Callout>Need another field? Ask Kuartz — fields are defined in code.</Callout>}>…champs inline…</Drawer>

// Ligne CMS éditable
<CMSRow onOpen={() => open(doc._id)} openLabel={`Open ${doc.title}`}>
  <CMSCell type="handle" checkboxLabel={`Select ${doc.title}`} checked={sel} onCheckedChange={toggle} />
  <CMSCell type="title" editing={editing} onEditRequest={edit} onCommit={save} onCancel={stop} inputLabel="Title">{doc.title}</CMSCell>
  <CMSCell type="status"><StatusSelect status={status} onAction={runAction} /></CMSCell>
</CMSRow>
```

## Décisions

- **Drawer : 810 px** (composant Figma 810 × 900, écran C4 : `abs@630`, 810 de large, LLM context « drawer de 810 px ») ; la
  description du composant (« 440 × 900 ») est périmée. `width` reste réglable.
- StatusSelect est un **bouton de menu** (actions selon l'état, C3 « proposé »), pas une liste de valeurs : on ne « choisit » pas Changed.
- PublishState du contrat (`failed`) pour la Top bar, comme PublishButton (Figma « error »).
- Galerie : section découpée en `sections/CompositesDataDisplay.tsx`, `CompositesNavigation.tsx`, `CompositesOverlays.tsx`
  (Overlays + AI editor), composées par `sections/Composites.tsx` ; liens ajoutés dans `NAV` (KitGallery.tsx).

## Demandes de contrat

- **ui-foundations / tokens** : ajouter `--k-z-overlay: 900;` (Modal, Drawer) aux dérivés de `tokens.css` (repli codé en attendant).
- **shell** : `ContentArea` + `Sidebar` + `TopBar` sont prêts ; la coque fournit le défilement vertical (`main { overflow-y: auto }`) et `linkAs={Link}`.
