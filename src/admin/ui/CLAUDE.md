# Kit UI de l'admin — LLM context

> Propriétaires : **ui-foundations** (fondations, Actions, Feedback, Forms, Avatar) · **ui-composites** (Data display,
> Navigation, Overlays, Model usage). Un seul document au modèle : chaque section sépare « Fondations (ui-foundations) »
> et « Composites (ui-composites) ». Les composites sont construits SUR les fondations (Button, IconButton, Icon, Tag,
> Checkbox, Select, Tooltip, Popover, motion-presets) sans les dupliquer.
> Figma : Design System « Kuartz — Carte système » (`docs/admin/figma/design-system/`, fiches `components/<Nom>.md` + `.png`)
> · Galerie : `/admin/kit` · Mis à jour : 2026-09-27

## Utilité

Le kit du Design System pour toutes les features de l'admin : tokens `--k-*`, reset scopé, polices, 75 icônes duotone,
préréglages de mouvement, primitive flottante (Popover + Portal), familles Actions, Feedback, Forms + Avatar (fondations),
puis Data display, Navigation, Overlays et Model usage (composites). Thème sombre uniquement exposé. Textes d'interface en
anglais. Ne contient AUCUNE logique métier (pas de Sanity, pas de moteur) : les features câblent les callbacks (`onFile`,
`onPublish`, `onValueChange`…). Utilisé par la coque (shell) et toutes les features de l'admin ; visible en dev sur `/admin/kit`.
Pas à ce module : Rich text field (cms-media), Script dialog (code-usage), AI editor (sauf Model usage) / Ask AI panel
(agents de l'éditeur), Kuartz hub.

## Fichiers

### Fondations (ui-foundations)

- `tokens.css` — tokens Figma recopiés (primitives, sémantiques Dark sur `[data-kz-admin]` et `[data-theme="dark"]`, Light
  sous `[data-theme="light"]` fourni tel quel mais non exposé, styles de texte `--k-text-<style>` + `-tracking`, élévations,
  modes `[data-icon-color]` en spécificité (0,1,0)) + dérivés du kit (`--k-control-height`, `--k-focus-ring`, couches
  `--k-z-panel` 800 / `--k-z-overlay` 900 / `--k-z-popover` 1000 / `--k-z-toast` 1100, `--k-ease-*`, `--k-duration-*`).
- `tokens.test.ts` — valeurs et ordre des couches `--k-z-*` (lu dans `tokens.css`).
- `base.css` — reset et base sous `:where([data-kz-admin])` (spécificité nulle) : box-sizing, police Body, fond bg/app,
  sélection, barres de défilement sombres, focus-visible commun (2 px border/focus), placeholder, liens (`a[data-kz-link]`),
  boutons, `.kz-visually-hidden`, filet de sécurité prefers-reduced-motion.
- `fonts.ts` — Inter 500/600/700 + Geist Mono 400 (next/font/google), `adminFontClassName`. Pas réexporté par `index.ts`.
- `motion-presets.ts` — valeurs pures (durées, courbes, ressorts, transitions, variantes) importables côté serveur ;
  `noTransition` et `reducedVariants()` (mêmes états, transitions coupées : base du mouvement réduit).
- `motion.ts` (client) — réexporte les préréglages + `motion`, `AnimatePresence`, `MotionConfig`, `useReducedMotion`,
  `useMotionVariants`, `useMotionTransition`. `motion.test.tsx` : balisage serveur identique avec / sans mouvement réduit.
- `icons/generate.mjs` → `icons/icons.generated.ts` (données des tracés, `ICON_NAMES`, `IconName`) ; `icons/Icon.tsx`, `types.ts`.
- `utils/` — `cx`, `mergeRefs`/`assignRef`, `useControllableState`, `shortcut.ts` (`useShortcut`, `useShortcutLabel`, `shortcutLabel`…).
- `Popover/` — `Popover.tsx`, `Portal.tsx`, `position.ts` (calcul pur, testé).
- `OptionList/` — liste `role="listbox"` au style Menu (Select, VariableInput, réutilisable par les composites) + `options.ts` (navigation pure).
- `Field/` — gabarit libellé / contrôle / aide / erreur (stacked, inline).
- `Chip/Chip.css.test.ts` — contrôle statique des règles de survol du Chip (jsdom ne simule pas `:hover`).
- Dossiers de composants : Button, IconButton, Chip, Tag, Kbd, Tooltip, ProgressBar, Callout, Toast, EmptyState,
  PublishButton, Input, Textarea, Select, SearchField, Checkbox, Radio, Switch, SettingRow, ImageUpload, CodeBlock,
  RemoveBadge, FaviconPreview (+ `favicon-bg-light.png` / `favicon-bg-dark.png`, fonds Figma @2x), ImagePreview,
  VariableChip, VariableInput, Avatar — chacun `Nom.tsx`, `Nom.module.css`,
  `index.ts`, `Nom.test.tsx` quand interactif.
- `index.ts` — exports publics (fondations en haut ; section « ui-composites » à la suite).
- `src/app/admin/kit/` — galerie de dev : `layout.tsx` (racine admin de la galerie), `page.tsx`, `KitGallery.tsx` (`NAV`),
  `kit.module.css`, `sections/` (`Foundations`, `Actions`, `Feedback`, `Forms`, `DataDisplay`, `ui.tsx` + sections composites).

### Composites (ui-composites)

- Dossiers : ListItem, TableCell (Table, TableRow, TableHeaderCell, TableCell), MediaCard, VersionItem, DetailRow, StatCard,
  AIUsage, SearchPreview, SocialPreview, HeadingRow, LockBadge, StatusSelect, CMSCell (CMSTable, CMSRow, CMSCell), RowOpen,
  ChecklistItem, ToolLink (ToolLinks, ToolLink), NavItem, NavSection, Tabs, SegmentedControl, Menu, Sidebar, TopBar, PageHeader, SectionHeader, ContentArea, Scrim, Modal,
  Drawer, FilterPopover, UsageTooltip, SelectionBar, ModelUsage — même découpage que les fondations.
- Tests des composites : `Modal/Modal.test.tsx`, `Modal/useModalDialog.test.tsx` (focus initial d'une fenêtre montée tard),
  `Drawer/`, `Tabs/`, `Menu/`, `SegmentedControl/`, `StatusSelect/`, `CMSCell/`, `SelectionBar/` (hydratation), `ListItem/`,
  `TopBar/`, `SectionHeader/`, `ChecklistItem/`, `ToolLink/`.
- Galerie : `src/app/admin/kit/sections/Composites.tsx` compose `CompositesDataDisplay.tsx`, `CompositesNavigation.tsx`,
  `CompositesOverlays.tsx` (Overlays + AI editor) ; liens dans `NAV` (KitGallery.tsx).

## Contrats

- **Entrées** : props seulement. Types du contrat lus : `PublishState`, `PublishStep` (PublishButton, TopBar), `Usage`
  (`contracts/engine`, ModelUsage) ; formatage `formatCost`, `formatTokens`, `formatUsageLine`, `modelLabel` (`contracts/format`).
- **Sorties** : composants et utilitaires exportés par `@/admin/ui` (catalogues ci-dessous) ; CSS `tokens.css` + `base.css`.
- **Dépend de** : `motion` (motion/react), `next/font` (fonts.ts seulement). **Utilisé par** : shell (`src/admin/shell`,
  `src/app/admin/layout.tsx`, `(shell)`), features `ai-editor`, `ask-ai`, `cms`, `code`, `general`, `media`, `overview`,
  `pages`, `publish`, `team`, `usage` ; `src/admin/live-edit` (site en ligne) importe SEULEMENT `icons/Icon` (pas
  l'index, pas `tokens.css`) : `Icon.module.css` doit rester autonome (repli `currentColor` hors de l'admin).

### Mise en place (layout de l'admin, propriété de shell — en place)

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
- `src/app/admin/layout.tsx` (shell, via `AdminRoot`) le fait pour tout `/admin`, `ToastProvider` compris. La galerie
  (`src/app/admin/kit/layout.tsx`) pose en plus sa propre racine (imbriquée, sans effet de bord).
- Les portails (Popover, Tooltip, Select, Toast, Modal, Drawer) se montent dans le premier `[data-kz-admin]` du document
  (sinon `<body>`, sans tokens !) ; `PortalContainerProvider` pour en imposer un autre.

### Catalogue — Fondations (ui-foundations)

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
| `PublishButton` + `failedAnnouncement()` | Bouton Publish (visuel) | `state: PublishState` (contrat ; `failed` = « error » du Figma), `onPublish`, `onRetry`, `pendingCount`, `failedStep: PublishStep` (annonce d'échec) | PublishButton.md |
| `Field` | Gabarit de champ | `label`, `hideLabel`, `htmlFor`/`labelId`, `helper`, `error`, `helperId`, `layout`, `helperClassName` | Input.md |
| `Input` | Champ texte | props `<input>` + `label`, `hideLabel`, `helper`, `error` (message ou `true`), `layout`, `icon`, `suffix`, `showCount` | Input.md |
| `Textarea` | Multiligne 88 px | props `<textarea>` + mêmes que Input (sans icône) | Textarea.md |
| `Select` | Liste déroulante | `options: ListItems` (options ou groupes ; `icon`, `meta`, `depth`, `disabled`), `value`/`defaultValue`/`onValueChange`, `placeholder`, `name`, `renderValue`, `error` | Select.md |
| `SearchField` | Recherche | `value`/`defaultValue`/`onValueChange`, `shortcut` (défaut `/`, `false`), `onClear`, `label`, `size` (`medium` 30 px par défaut, `small` 28 px pour une barre d'outils) | SearchField.md |
| `Checkbox` | Case | `label`, `checked`/`defaultChecked`/`onCheckedChange`, `indeterminate` | Checkbox.md |
| `RadioGroup` + `Radio` | Choix unique | groupe : `label`, `value`/`defaultValue`/`onValueChange`, `disabled`, `orientation` ; radio : `value`, `label` | Radio.md |
| `Switch` | Interrupteur | `label`, `checked`/`defaultChecked`/`onCheckedChange`, `name` | Switch.md |
| `SettingRow` | Réglage + Switch | `title`, `description`, `checked`…, `disabled`, `control` (autre contrôle) | SettingRow.md |
| `ImageUpload` | Envoi d'image | `onFile` (obligatoire), `value {src,name,size}`, `uploading {name,progress}`, `onRemove`, `onReject`, `actions` (ex. « Choose from Media »), `accept`, `maxSize`, `hint`, `error`, `height` | ImageUpload.md |
| `CodeBlock` | Code | `value`/`defaultValue`/`onValueChange`, `readOnly`, `readOnlyNote`, `highlight`, `lineNumbers`, `minLines`, `error` ; `tokenizeCode()` | CodeBlock.md |
| `RemoveBadge` | Pastille ✕ 18 px | `label`, `corner` (coin haut droit du parent relatif) | RemoveBadge.md |
| `FaviconPreview` | Favicon sur le fond navigateur du Figma (image) | `theme` light/dark, `src` (repli si absent ou illisible), `onFile`, `onRemove` (si `src`), `label`, `accept`, `disabled` | FaviconPreview.md |
| `ImagePreview` | Image 1200 × 630 | `src`, `alt`, `ratio`, `width`, `onRemove`, `emptyLabel` | ImagePreview.md |
| `VariableChip` | Champ CMS dans un texte | `name`, `label`, `invalid` | VariableChip.md |
| `VariableInput` | Texte + puces `{{champ}}` | `variables: {name,label,icon}[]`, `value`/`defaultValue`/`onValueChange` (texte avec `{{…}}`), `helper`, `error`, `name` ; `parseVariables`, `serializeVariables`, `variablesIn`, `resolveVariables` | VariableInput.md |
| `Avatar` | Avatar rond | `name`, `initials`, `src`, `size` 20/28/40, `tone` blue/green/neutral, `decorative` ; `initialsOf()` | Avatar.md |
| `Popover` + `Portal` | Primitive flottante | `open`, `onClose(reason)`, `anchorRef`, `placement`, `offset`, `matchAnchorWidth`, `closeOnEscape`, `closeOnOutsideClick`, `closeOnFocusOut`, `initialFocus` panel/first/none, `returnFocus`, `inert`, `instant`, `surface` | Menu.md (surface) |
| `OptionList` | Listbox au style Menu | `items`, `activeIndex`/`onActiveIndexChange`, `selected`, `onSelect`, `optionId`, `focusable`, `onKeyDown` | Menu.md, MenuItem.md |

### Catalogue — Composites (ui-composites)

« pur » = sans hook, utilisable dans un Server Component ; sinon `'use client'`. Tout est exporté par `@/admin/ui`.

**Data display**

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `ListItem` (pur) | Ligne de liste 47 px | `title`, `subtitle`, `meta`, `tag`, `avatar` (nœud) ou `icon`, `action` (nœud), `href` / `onClick` (lien étiré, l'action reste au-dessus), `textGap` 0 (défaut, Figma) / 2 (listes de E1) | ListItem.md |
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
| `CMSTable`, `CMSRow`, `CMSCell` + `CMS_COLUMN_WIDTHS` | Tableau façon tableur (C3) | table : `aria-label`, `role` (table ; grid si la feature gère les flèches) ; ligne : `header`, `selected`, `onOpen` + `openLabel` (Row open) ; cellule : `type` header/handle/text/title/status/image, `width`, `src`, `checked`/`indeterminate`/`onCheckedChange`/`checkboxLabel`, `grip`, `gripProps` (type `GripProps` : poignée focalisable = `<button>` qui reçoit ces props) + `gripLabel` (« Reorder … ») + `gripTooltip`, `editing` + `editValue`/`onCommit`/`onCancel`/`onEditRequest`/`inputLabel` | CMSCell.md |
| `RowOpen` | Bouton « ouvrir » sur fondu (120 × 44) | `onOpen`, `label` ; sticky à droite dans une ligne `[data-row]` ; CMSRow le précède d'un remplissage extensible (`[data-row-filler]`) | RowOpen.md |
| `ChecklistItem` (pur) + `CHECKLIST_STATE_LABELS` | Étape d'une liste de contrôle | `state` todo/running/done/skipped/failed (type `ChecklistState`), `title`, `description`, `action`, `stateLabel`, `as` li/div | E1 « Checklist item » (Kuartz hub, sans fiche) |
| `ToolLinks` + `ToolLink` | Actions icônes collées 36 × 36 | groupe : `aria-label` ; action : `icon`, `label` (nom + infobulle), `href` (+ `download`, `target`), `onClick`, `tone` default/danger, `disabled` + `disabledReason`, `tooltip` | C5 « Tool link(s) » (Kuartz hub, sans fiche) |

**Navigation**

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `NavItem` (pur) | Entrée de sidebar 32 px | `label`, `icon`, `count`, `tag`, `active` (aria-current), `href` + `as` (next/link), `depth` 0/1, `expanded` + `onExpandedChange` (chevron = bouton séparé), `expandLabel`, `wrapperClassName` | NavItem.md |
| `NavSection` (pur) | Titre de section | `label`, `action`, `labelId` | NavSection.md |
| `Tabs`, `Tab`, `TabPanel`, `tabId()`, `tabPanelId()` | Onglets | `items [{value, label, disabled, href}]`, `value`/`defaultValue`/`onValueChange`, `activation` automatic/manual, `idBase`, `linkAs` ; tous les items avec `href` → `<nav>` de liens (aria-current) | Tab.md, Tabs.md |
| `SegmentedControl`, `Segment` | Choix unique compact | `items [{value, label, icon, disabled, shortcut}]`, `value`/`defaultValue`/`onValueChange`, `aria-label`, `disabled` ; segment à icône = infobulle | Segment.md, SegmentedControl.md |
| `Menu`, `MenuPanel`, `MenuItem`, `MenuGroup`, `MenuSeparator` | Menu (APG menu button) | menu : `trigger` (élément bouton), `open`/`defaultOpen`/`onOpenChange(open, reason)`, `placement`, `width` (216), `aria-label` ; panneau : `initialFocus` first/last/none, `width` ; élément : `icon`, `shortcut`, `selected` (+ `multiple`), `disabled`, `danger`, `href`, `onSelect(event)` (`preventDefault()` = reste ouvert), `keepOpen` | MenuItem.md, Menu.md |
| `Sidebar` | Sidebar 240 px (présentationnelle) | `site {name, domain, screen, logo}`, `sections [{id, label, action, items}]` (item : `id, label, icon, href, onClick, active, count, tag, children, defaultExpanded`), `user {name, role, avatar, initials, tone}`, `onAskAI`, `onLogout` ou `logout` (nœud), `hub {href, label}`, `linkAs`, `expanded`/`onExpandedChange` | Sidebar.md |
| `TopBar` (pur) + `topBarStatusText()` | Barre du haut 48 px | `state: PublishState`, `pendingCount`, `statusText`, `statusAction` (emplacement « See error », après le texte d'état et Review), `reviewHref`/`onReview`, `autosaveText` (null = masqué), `siteUrl` (View site ↗), `publish` (slot PublishButton), `linkAs` | TopBar.md, G3 |
| `PageHeader` (pur) | En-tête d'écran (h1) | `title`, `meta`, `description`, `actions` (gap 12), `tools` (toolbar, gap 4), `toolsLabel`, `tabs`, `headingLevel` | PageHeader.md |
| `SectionHeader` (pur) | Titre de section (h2) | `title`, `description`, `action`, `headingLevel` 1-4 (1 = titre d'écran sans Page header, B3 Code ; même rendu Heading 4 ; B5 Usage a un Page header → `PageHeader`), `titleId` | SectionHeader.md |
| `ContentArea` (pur) | Zone de contenu de la coque | `gap` 16/20/24, `padding` default (28 40 40) / tabs (24 40), `width` default (1 120 utiles) / full, `as` | écrans B1, C3, C5 |

**Overlays**

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `Scrim` | Voile bg/scrim | `position` fixed/absolute, `enterDuration`, `onClick` | Scrim.md |
| `Modal` (+ `useModalDialog`, `focusableIn`) | Fenêtre modale 480 | `open`, `onClose(reason: escape/scrim/close/cancel)`, `title`, `description`, `children`, `footer` ou `onConfirm` + `confirmLabel`/`cancelLabel`/`confirmLoading`/`confirmDisabled`, `tone` default/destructive (alertdialog), `width`, `closeOnScrimClick`, `hideClose`, `initialFocusRef` | Modal.md |
| `Drawer` | Panneau latéral 810 | `open`, `onClose(reason: escape/scrim/close)`, `title`, `status`, `actions`, `children`, `footer`, `width` (810), `closeOnScrimClick`, `initialFocusRef` | Drawer.md, écran C4 |
| `FilterPopover` + `DEFAULT_FILTER_OPERATORS` | Fenêtre de filtres 420 | `fields [{value, label, operators, options}]`, `conditions`/`defaultConditions`/`onConditionsChange` (`{id, field, operator, value}`), `trigger` ou `open` + `anchorRef`, `placement` (bottom-end), `title` | FilterPopover.md |
| `UsageTooltip` | Usage d'un média (300) | `title`, `places [{label, image, highlight {x,y,width,height} en fractions, href}]`, `children` (déclencheur), `open`…, `openDelay` 300, `closeDelay` 150, `viewLabel` | UsageTooltip.md |
| `SelectionBar` | Barre de sélection | `selectedCount`, `totalCount`, `onSelectAll(checked)`, `onClear`, `onDownload`, `deletableCount` + `onDelete` (allowed / partial / blocked déduits), `noun`/`nounSingular`, `children` | SelectionBar.md |

**AI editor (partagé)**

| Export | Rôle | Props clés | Figma |
|---|---|---|---|
| `ModelUsage` (pur) | Modèle + tokens + coût | `usage {model, inputTokens, outputTokens, costUsd, costKind}`, `model`, `size` default/small, `showModel`, `showUsage` ; formaté par `modelLabel`, `formatTokens`, `formatCost`, `formatUsageLine` (contrat) | ModelUsage.md |

## Comportement

### Fondations (ui-foundations)

**États**
- Button : `loading` (loader, `aria-busy`, clic ignoré), `disabled` ; pression `scale(0.98)`. IconButton : `pressed` (aria-pressed), tooltip.
- Chip : off, hover (état off seulement : bg/input-hover + icône active), on (fond bg/inverse, texte et icône inversés),
  on survolé (fond `color-mix` 88 % bg/inverse, texte inchangé — pas de variante Figma), disabled (opacité 0.4).
  Plusieurs chips actives à la fois (`aria-pressed`), contrairement au Segmented control.
- PublishButton (G3) : `idle` (Publish désactivé), `pending` (Publish ; « Publish N changes » lu), `publishing`
  (« Publishing… », loader, aria-busy, clic ignoré), `published` (✓ Published, secondaire ; retour géré par l'appelant),
  `failed` (Retry, danger). Annonce polie à chaque état (vide pour idle / pending). Annonce d'échec selon `failedStep`
  (`failedAnnouncement`) : étape 1 → « Publish failed at step 1 of 4. Nothing was published. Retry to try again. » ;
  étapes 2-4 → « Publish failed at step N of 4. Any content changes are already live. Retry to resume from this step. » ;
  sans étape → « Publish failed. Retry to resume from the step that failed. » (la suite n'est pas atomique : jamais
  « rien n'a changé » sans le savoir).
- Toast : `success` / `error` / `info` / `loading` ; 5 s (6 s pour une erreur), `loading` permanent jusqu'à `update`,
  3 visibles au plus, le plus récent en bas, minuteur suspendu au survol et au focus.
- ImageUpload : vide, survol de glisser-déposer, envoi (`uploading` + ProgressBar), rempli (`value`), erreur ; refus
  (type MIME, taille) remontés par `onReject` et annoncés. `actions` (fournies par la feature, qui gère leur état) :
  dans la ligne fichier avant Replace à l'état rempli, sinon dans une ligne sous la zone (jamais dans la zone-bouton).
- SearchField `size="small"` : 28 px (pad vertical 5), à la hauteur des Icon buttons d'une barre d'outils.
- Champs (Input, Textarea, Select, VariableInput, CodeBlock) : `error` = contour erreur + message lié (`aria-invalid`,
  `aria-describedby`) ; `disabled` ; `readOnly` (CodeBlock : cadenas + `readOnlyNote`).

**Focus et clavier**
- Focus visible partout (2 px border/focus, décalage 2) ; champs : la bordure devient border/focus (Figma « focused »).
- Échap : Popover / Select / Tooltip / liste d'insertion de VariableInput ferment la couche du dessus seulement (pile
  `useLayer` / `isTopLayer`) et rendent le focus à l'ancre ; SearchField vide le texte (puis `onClear`), ou quitte le champ s'il est déjà vide.
- Raccourcis globaux (`useShortcut`) : ignorés quand le focus est dans un champ si le raccourci n'a pas de modificateur ;
  SearchField prend `/` par défaut. Libellés `⌘ K` / `Ctrl K` (« ⌘ » au rendu serveur, vraie plateforme après montage).
- Select : motif APG « combobox select-only » (focus sur le champ, `aria-activedescendant`, ↑ ↓ Home End PageUp PageDown,
  Entrée/Espace, Échap, Tab choisit, recherche par lettres, champ caché `name`).
- Tooltip : `role="tooltip"`, `aria-describedby` (omis si le texte est déjà le nom accessible, cas IconButton), clavier
  sans délai, délai de 500 ms au pointeur, tooltips suivants instantanés (fenêtre « chaude » de 400 ms).
- Checkbox / Radio : inputs natifs (Espace, flèches, formulaires) ; Switch : `role="switch"` nommé par un `<label>` englobant.
- Toast : région « Notifications », `aria-live="polite"`, erreurs en `role="alert"`.
- ImageUpload : zone = bouton (Entrée/Espace pour parcourir), refus en `role="alert"`, progression en `role="status"`.
- VariableInput : `role="textbox"` contentEditable, `aria-autocomplete="list"`, liste d'insertion au clavier (↑ ↓, Entrée / Tab).

**Conventions**
- CSS Modules + `var(--k-*)` uniquement (aucune couleur en dur, sauf la pastille de repli de FaviconPreview (posée sur
  l'image claire / sombre du Figma) et les ombres du Remove badge, codées en dur dans Figma aussi ; mélanges `color-mix` de tokens admis). Styles de texte :
  `font: var(--k-text-body); letter-spacing: var(--k-text-body-tracking);`.
- Couleur d'icône : le composant pose `--k-icon-current` (ou `data-icon-color="…"` sur un parent) ; `<Icon>` lit `color: var(--k-icon-current)`.
- Jeu d'icônes : les fiches Figma posent souvent le jeu **18** réduit (Button small 12, Chip 12, Tag 10, Input 16) : `set={18}`.
  Le jeu 12 sert à Checkbox (coche), Menu item (coche), CodeBlock (cadenas).
- API : props contrôlées ou non (`value`/`defaultValue`/`onValueChange`, `checked`…, `pressed`…) via `useControllableState` ;
  `ref` en prop (React 19) ; `className` transmis à la racine ; autres props HTML étalées sur l'élément natif principal.
- Composants purs (sans hook) : Button, Tag, Kbd, Callout, EmptyState, ProgressBar, RemoveBadge, ImagePreview, VariableChip, Field, Icon
  → utilisables tels quels dans un Server Component. Les autres sont `'use client'`.
- Pas d'import Next dans les composants (sauf `fonts.ts`) : images en `<img>` (le kit ne connaît pas next/image) ; une image
  statique du kit s'importe (`import bg from './x.png'`) et se lit `typeof bg === 'string' ? bg : bg.src` (Next / vitest).
- Couches (`--k-z-*`) : contenu < `panel` 800 (panneau flottant non modal, Ask AI) < `overlay` 900 (Modal, Drawer) <
  `popover` 1000 (Select, Menu, Tooltip… ouverts dans une modale passent devant) < `toast` 1100.

**Mouvement** (skills web-animation-design + motion)
- Survol / couleur : CSS `ease` 150 ms (`--k-duration-fast`). Pression : `scale(0.98)` (Button), `0.96` (IconButton), `0.94` (Remove badge).
- Entrées / sorties : `popIn` (0.96 → 1, 150 ms ease-out-quint, origine = ancre via `--k-popover-origin`), `slideUp` (toast, 250 ms),
  `fade`, `slideDown`, `list` + `listItem` (échelonnement 30 ms). Sortie ≈ 80 % de l'entrée. Ressorts sans rebond (`spring.snappy`).
- Rien au clavier : Select ouvert au clavier = `instant` ; défilement de liste sans animation.
- Mouvement réduit : chaque module CSS a son `@media (prefers-reduced-motion: reduce)` + filet global dans base.css ;
  en JS, `useMotionVariants()` renvoie les MÊMES variantes (état `initial` compris) avec des transitions nulles
  (`reducedVariants`, variantes calculées comprises) — le rendu serveur, qui ignore la préférence, est donc identique à
  celui du client : pas d'écart d'hydratation (FOLLOWUPS #38) ; `useMotionTransition()` renvoie `noTransition`.
  Loader : rotation coupée.

### Composites (ui-composites)

**Conventions**
- Mesures reprises des fiches et contrôlées dans la galerie (Chrome, 1 440 px) : List item 560 × 47, Tabs 35 (Tab 34), Segmented
  control 29 / 30 (icônes), Menu 216 (élément 206 × 28), Sidebar 240 × 900 (Nav item 223 × 32), Top bar 48, Page header 28 avec
  outils, Version item 380 × 36, Media card 184 × 163, Status select 54 × 19, CMS : en-tête 41 / ligne 45 (40 / 44 + trait),
  Selection bar 37, Heading row 24, AI usage 384 × 217, Filter popover 420 × 134, Usage tooltip 300 × 374, Drawer 810 × 900,
  Tool links 112 × 38 (3 actions), Checklist item 346 × 52 (Figma 53).
- Largeurs Figma « étirables » rendues fluides (ListItem, VersionItem, DetailRow, StatCard, AIUsage, Heading row) ; les fixes
  restent fixes (MediaCard 184, Menu 216, Sidebar 240, Filter popover 420, Usage tooltip 300, Modal 480, Drawer 810).
- Liens : le kit ne connaît pas next/link. `as` (NavItem, ContentArea), `linkAs` (Sidebar, Tabs, TopBar) acceptent le composant
  de lien de l'appelant. Liens externes (`View site`, `View`) : `target="_blank"` + `rel="noopener noreferrer"` + « (opens in a new tab) » masqué.
- Couches : Modal et Drawer à `z-index: var(--k-z-overlay, 900)` (token défini dans tokens.css ; le repli codé reste
  inoffensif), sous les popovers (1000) et les toasts (1100).
- Pile de couches commune (`useLayer` / `isTopLayer` du Popover) : Modal, Drawer, Popover, Menu, Select… Échap ne ferme que la couche du dessus.

**Mouvement**
- Modal : échelle 0.96 → 1 + fondu, 200 ms ease-out-quint (sortie 160 ms, vers 0.98) ; Scrim apparié (même durée, même courbe).
- Drawer : `translateX(100%) → 0`, 280 ms ease-out (sortie 224 ms) ; Scrim apparié (280 ms). `transform` en chaîne → WAAPI (skill motion), pas de will-change.
- Menu, FilterPopover, UsageTooltip, StatusSelect : `popIn` du Popover (0.96 → 1 depuis l'ancre, `--k-popover-origin`) ; un menu
  ouvert au clavier est instantané (`instant`).
- SelectionBar : `slideDown` à l'apparition (l'appelant l'enveloppe dans `<AnimatePresence>` pour la sortie). Mouvement réduit :
  MÊME état initial (`opacity 0, y -6`), transitions nulles (`slideDownReduced`) ; `useMotionVariants(slideDown)` donne
  désormais le même résultat (FOLLOWUPS #38).
- ChecklistItem : l'icône est reposée à chaque changement d'état (clé = état) ; entrée CSS 0.8 → 1 + fondu, 150 ms ease-out.
- Survol / sélection (NavItem, Tab, Segment, VersionItem, lignes de tableau, Media card) : couleur `ease` 150 ms, sans mouvement ;
  chevrons : rotation 150 ms ease-in-out. Menu : aucune transition (navigation fréquente, focus déplacé par le pointeur).
- Mouvement réduit : `useReducedMotion` dans Modal / Drawer (fondu instantané) et SelectionBar (transitions nulles, même état
  initial), `useMotionTransition` (Scrim), `useMotionVariants` (Popover, via les fondations) + `@media (prefers-reduced-motion:
  reduce)` dans chaque module qui a une transition. Vérifié en Chrome (`reducedMotion: 'reduce'`) : le Drawer est en place dès la première frame.

**Accessibilité, focus, Échap**
- Modal / Drawer : APG dialog modal (`role="dialog"` ou `alertdialog` en destructive, `aria-modal`, titre `aria-labelledby`,
  description `aria-describedby`), focus initial (`initialFocusRef` → `[data-autofocus]` → premier champ → la fenêtre), piège de Tab /
  Maj+Tab, Échap (couche du dessus seulement), clic sur le voile, retour du focus au déclencheur, défilement de la page verrouillé.
  Focus initial (`useModalDialog`) : attend la fenêtre frame après frame (30 au plus, ≈ 0,5 s : fenêtre ouverte dès le montage,
  portail en retard) et ne déplace pas un focus déjà posé DANS la fenêtre (autoFocus, geste de l'utilisateur).
- Menu : APG menu button (aria-haspopup, aria-expanded, aria-controls), `role="menu"` nommé par le déclencheur, roving tabindex,
  ↑ ↓ en boucle, Home / End, première lettre, Entrée / Espace, Échap et Tab referment et rendent le focus ; `menuitemradio` /
  `menuitemcheckbox` avec `aria-checked` quand `selected` est défini ; éléments désactivés sautés ; `MenuGroup` = `role="group"` nommé.
  Focus initial : si le focus est refusé (Popover encore `visibility: hidden`, ouverture contrôlée sans clic), `MenuPanel` réessaie
  à chaque frame (20 au plus), sauf si le focus est déjà dans le menu.
- Tabs : APG tabs (tablist, aria-selected, aria-controls ↔ tabpanel, roving tabindex, ← → Home End, automatique ou manuel) ;
  onglets de route = `<nav>` de liens + `aria-current="page"` (pas de rôle tab pour une navigation).
- SegmentedControl : `radiogroup` + `radio` (aria-checked), roving tabindex, flèches qui sélectionnent ; segments à icône nommés + infobulle.
- Sidebar : `<aside>` + `<nav aria-label="Admin">`, listes nommées par leur Nav section, `aria-current="page"`, chevron = bouton
  `aria-expanded` distinct du lien.
- CMS : table / row / columnheader / cell par défaut ; édition sur place = `<input>` nommé (`inputLabel`), Entrée valide, Échap annule
  (sans fermer la fenêtre parente), clic ailleurs valide ; cases nommées (« Select … ») ; Row open nommé par l'élément.
  Poignée : décorative (`aria-hidden`) sans `gripProps` ; avec `gripProps`, `<button type="button">` nommé (`gripLabel`), avant la
  case dans l'ordre de tabulation, `aria-pressed` / `aria-disabled` / `aria-describedby` et gestionnaires fournis par la feature.
- StatusSelect : bouton de menu nommé « Status: Live » (contient le libellé visible).
- LockBadge : `role="img"` focalisable, nom = raison, infobulle au survol et au focus. HeadingRow : « Heading level N: » lu, pastille masquée.
- UsageTooltip : fenêtre non modale (`role="dialog"`, contient des liens), déclencheur `aria-haspopup="dialog"` + `aria-expanded` ;
  clic ou ↓ → focus dans la fenêtre ; survol → s'ouvre sans prendre le focus.
- SelectionBar : `role="region"` « Selection », compte en `aria-live="polite"`, case « tout » cochée / mixte.
- ModelUsage : le texte visible est découpé pour la couleur ; la ligne complète (`formatUsageLine`) est lue une fois (texte masqué).
- TopBar : le texte d'état n'est pas une zone live (PublishButton annonce déjà) ; `statusAction` est rendu dans le groupe d'état
  (`[data-status-action]`, ne rétrécit pas), après Review.
- ChecklistItem : `<li>` (dans un `<ol>` de l'appelant), état lu avant le titre (« Done: … », texte masqué), `aria-current="step"`
  sur l'étape en cours.
- ToolLinks : `role="group"` nommé ; ToolLink = bouton ou lien nommé par `label` + infobulle ; désactivé = `aria-disabled` (reste
  focalisable, clic ignoré, l'infobulle donne `disabledReason`).

## Forces

### Fondations (ui-foundations)
- Valeurs Figma reprises au pixel (tailles mesurées dans la galerie : Button 37/39, Input 34, Select 34, Tag 16, Kbd 16, Tooltip 25,
  Toast 45, Switch 32×18, Setting row 58, Image upload 213/250, Favicon 180×147, Variable input 360×77 — voir la fiche de chaque composant).
- Tokens scopés : aucune fuite vers le site ; resets en `:where()` (jamais de conflit de spécificité avec les modules).
- 78 tests (jsdom + calculs purs : position, icônes, sérialisation `{{…}}`, coloration, couches `--k-z-*`, règles de survol du Chip).
- Icônes générées et vérifiées contre les SVG sources (un test échoue si un SVG est ajouté sans régénérer).

### Composites (ui-composites)
- Tailles Figma retrouvées au pixel (voir Conventions) et rendu comparé aux écrans C3, C4, C5, B1 et aux planches Sidebar / Top bar.
- Aucune couleur en dur : tout passe par `--k-*` (le fondu du Row open utilise `color-mix` sur bg/input-hover).
- Réutilisation stricte des fondations : Menu et StatusSelect sur Popover, FilterPopover sur Popover + Select, UsageTooltip sur
  Popover + Button, Sidebar sur NavItem / NavSection / Button / IconButton / Avatar / Tag.
- Tests jsdom / rendu serveur : Modal (+ `useModalDialog`), Drawer, Tabs, Menu, SegmentedControl, StatusSelect, CMSCell,
  SelectionBar (balisage identique avec ou sans mouvement réduit), ListItem, TopBar, SectionHeader, ChecklistItem, ToolLink.

## Faiblesses et limites connues

### Fondations (ui-foundations)
- Contrastes Figma sous AA pour certains textes secondaires : text/muted #666 sur #000/#1f1f1f (≈ 3,7:1 / 3,0:1 : aides,
  placeholders, compteurs) ; Kbd quasi invisible dans un Search field (bg/subtle sur bg/input). Gardés tels quels (fidélité au Figma).
- Écarts assumés au Figma : Chip « on » garde son contour (couleur du fond) → 66×25 au lieu de 64×23 (pas de saut à la bascule) ;
  Chip « on » survolé inventé (pas de variante Figma) ; Search field « filled » reste à 30 px (le ✕ déborde de 2 px) au lieu
  de 34 ; Callout et Setting row fluides (400 / 560 px dans Figma).
- FaviconPreview : le fond est l'image du Figma (calque « browser », exportée @2x : `favicon-bg-light.png` /
  `favicon-bg-dark.png`, onglets voisins Gmail et Kuartz compris) ; seul le favicon (x 72, y 35, 16 × 16) est dynamique.
  Si le fond change dans Figma, réexporter le calque « browser » de chaque variante (sans le favicon) et remplacer les PNG.
  Repli sans favicon / image illisible : pastille neutre 16 px (pas d'état vide dans Figma).
- CodeBlock : coloration minimale (balises, accolades, `{{…}}`), pas d'éditeur complet (pas d'indentation automatique, Tab ne s'insère pas).
- VariableInput : contentEditable maison — une seule ligne, collage en texte brut, pas d'annulation fine (Ctrl+Z natif seulement
  sur la frappe) ; la position du curseur est restaurée par décompte de caractères après transformation d'un `{{champ}}` tapé.
- PublishButton : l'annonce d'étape ne sait pas s'il y avait du contenu (« Any content changes ») ; elle ne dit pas « See error »
  (bouton posé par publish-ui, pas par le kit).
- Hover / pressed ne se montrent pas en statique dans la galerie (états CSS vivants) ; pas de prop pour les forcer.
- Le thème Light (inachevé dans Figma) n'est ni testé ni exposé.

### Composites (ui-composites)
- CMS : pas de navigation aux flèches entre cellules ; le glisser-déposer n'est pas dans le kit : la poignée focalisable
  (`gripProps`) ne fait que recevoir les gestionnaires de la feature (cms-media, `useReorder`). Flèches : passer `role="grid"`
  à CMSTable et gérer le focus des cellules côté feature.
- ChecklistItem et ToolLinks n'ont pas de fiche Figma (composants du Kuartz hub) : repris des arbres E1 / C5 et des compositions
  de publish-ui / media ; Checklist item mesure 52 px au lieu de 53.
- Modal / Drawer : le reste de la page n'est pas rendu `inert` (aria-modal + piège du focus seulement) ; un lecteur d'écran en
  navigation virtuelle peut encore lire l'arrière-plan sur certains couples navigateur / lecteur.
- Sidebar : le dépliage des pages listing n'est pas animé (entrée utilisée 100 fois par jour) ; les ids des sections viennent de `useId`.
- TopBar : « Draft saved automatically » est masqué sous 1 100 px.
- UsageTooltip : le cadre rouge est transparent (le Figma remplit la zone en #2b2b2b car sa capture est une maquette) ; les
  coordonnées du cadre sont des fractions de la miniature recadrée 278 × 124 (`object-fit: cover`) : à calculer sur la même découpe.
- AIUsage : la note par défaut est le texte du Figma ; pas de graphique (hors Figma).
- Contrastes Figma gardés (text/muted sur bg/elevated pour les méta, compteurs, notes : ≈ 3,4:1).

## Points sensibles

### Fondations (ui-foundations)
- Ne jamais poser les tokens sur `:root` ni importer `tokens.css`/`base.css` hors de `src/app/admin/`.
- Un portail hors de `[data-kz-admin]` perd les tokens et les polices : garder un conteneur admin dans la page.
- `CodeBlock` n'exécute rien et n'injecte jamais de HTML (rendu par nœuds texte React) ; `VariableInput` construit ses puces
  avec `textContent` (jamais `innerHTML`) : garder ces deux règles (textes venant du CMS).
- `ImageUpload` ne vérifie que le type MIME annoncé et la taille : la vraie validation se fait côté serveur (features).
- Grammaire `{{nom}}` alignée sur le site (`src/lib/template-variables.ts`, site-adapter) : `[A-Za-z_][A-Za-z0-9_]*`.
  La changer des deux côtés à la fois ; le site échappe les valeurs selon le contexte, pas le kit.
- Annonce de PublishButton : ne jamais affirmer que « rien n'a changé » sans connaître l'étape en échec (contenu publié à l'étape 1).

### Composites (ui-composites)
- Liens externes : toujours `target="_blank"` + `rel="noopener noreferrer"` (View site, View de l'Usage tooltip).
- Modal destructive = `alertdialog` : la feature garde la confirmation explicite (`onConfirm`) avant toute suppression.
- Les composites n'appellent rien : Sidebar, TopBar, StatusSelect, SelectionBar remontent des callbacks ; droits et
  vérifications restent dans les features (le kit ne masque pas une action interdite de lui-même).

## Pièges

### Fondations (ui-foundations)
- `motion.ts` est client : importer les VALEURS depuis `motion-presets.ts` (ou `@/admin/ui`) dans un Server Component, pas depuis `@/admin/ui/motion`.
- `fonts.ts` n'est pas dans le barrel : `next/font` ne tourne pas sous Vitest.
- Portail monté un rendu après son parent : `Popover` relance son placement quand le panneau apparaît (état `panel`) ; ne pas
  revenir à un simple `useRef` (placement nul pour un popover ouvert d'emblée).
- `mergeRefs` recrée un callback à chaque rendu : le mémoïser quand il pose un état (voir `setRefs` dans Popover).
- Les tooltips partagent un état de module (« chaud ») : en test, avancer l'horloge (`vi.setSystemTime`) entre deux cas.
- Tests de toasts / exits : `MotionGlobalConfig.skipAnimations = true` (sinon l'exit ne se termine pas sous minuteurs simulés).
- Une image cassée rendue par le serveur déclenche `onError` avant l'hydratation : Avatar relit `complete/naturalWidth` au montage.
- `LayoutProps<'/admin/kit'>` peut échouer au typage quand `.next/types` (build) est en retard sur `.next/dev/types` : props typées à la main.
- Spécificité des états : `:hover:not(:disabled)` (0,3,0) bat `[data-state='on']` (0,2,0). Limiter un survol à l'état
  qu'il décrit (`[data-state='off']:hover…`) plutôt que d'empiler des `!important` (bug corrigé sur Chip, FOLLOWUPS #23).

### Composites (ui-composites)
- `MenuItem.onSelect` : appeler `event.preventDefault()` garde le menu ouvert — ne pas appeler `preventDefault` avant l'action
  dans un gestionnaire clavier (bug corrigé : Entrée ne refermait plus le menu).
- `MenuPanel` prend `initialFocus`, pas `autoFocus` (conflit avec l'attribut HTML).
- `TableHeaderCell.align` remplace l'attribut HTML obsolète `align` (omis du type).
- Tests Modal / Drawer : le focus initial passe par `requestAnimationFrame` (portail monté un rendu plus tard, jusqu'à 30 frames)
  → attendre le focus (`waitFor`) avant de focaliser autre chose ; `MotionGlobalConfig.skipAnimations = true` pour les sorties.
- jsdom focalise un élément sous `visibility: hidden` (un navigateur non) : le test du focus initial du Menu simule le refus en
  espionnant `HTMLElement.prototype.focus`.
- Composant rendu par le serveur et animé par Motion : ne JAMAIS faire dépendre `initial` de `useReducedMotion` (le serveur ne
  connaît pas la préférence) ; ne changer que les transitions (voir SelectionBar).
- `RowOpen` dans une ligne `[data-row]` est `position: sticky` (collé au bord droit VISIBLE du tableau qui défile) avec
  `margin-left: -120px` : il doit rester le dernier enfant de la ligne, précédé du remplissage `[data-row-filler]` (CMSRow pose
  les deux ; une feature n'a plus à ajouter sa propre cellule vide).
- `CMSCell` avec `gripProps` + `gripTooltip` : l'infobulle fusionne son `aria-describedby` avec celui des `gripProps`.
- `ModelUsage` importe `Usage` depuis `contracts/engine` (format.ts ne le réexporte pas).

## Comment modifier

### Fondations (ui-foundations)
- **Nouvelle icône** : l'exporter du Figma dans `docs/admin/figma/design-system/icons/` (+ `12/`), puis
  `node src/admin/ui/icons/generate.mjs` ; `IconName` s'étend tout seul. Mettre à jour le test du nombre (75).
- **Nouveau token** : l'ajouter dans `tokens.css` (bloc Dark ET Light) avec le nom `--k-<chemin Figma>`. Nouvelle couche :
  dans les dérivés (`--k-z-*`), en respectant l'ordre testé par `tokens.test.ts`.
- **Nouvelle variante de Button** : classe dans `Button.module.css` (fond, `--k-icon-current`, états `:hover`/`:active` avec
  `:not(:disabled, [data-loading])`), union `ButtonVariant`, ligne dans la galerie.
- **Changer une annonce de PublishButton** : `VISUALS` / `failedAnnouncement` dans `PublishButton.tsx` + son test ; garder
  l'accord avec le texte visible de la Top bar (publish-ui, `bar-state.ts`).
- **Nouveau composant** : dossier `Nom/` (`Nom.tsx`, `Nom.module.css`, `index.ts`, test si interactif), export dans `index.ts`,
  section dans `src/app/admin/kit/sections/*` + lien dans `NAV` (KitGallery.tsx).
- **Liste flottante sur mesure (Menu, FilterPopover…)** : `Popover` (+ `OptionList` pour une liste de choix) ;
  surface standard avec `surface` (défaut), `initialFocus="first"` pour un menu, `closeOnFocusOut` pour une liste.

### Composites (ui-composites) — recettes

```tsx
// Coque (shell) : Sidebar + TopBar + ContentArea
<Sidebar site={{ name, domain, screen: 'Overview' }} sections={sections} user={{ name, role: 'Kuartz', tone: 'blue' }}
  onAskAI={openAskAI} logout={<form action={logout}><IconButton type="submit" icon="logout" label="Log out" /></form>}
  hub={isKuartz ? { href: HUB_URL } : undefined} linkAs={Link} />
<TopBar state={publish.state} pendingCount={n} reviewHref="/admin/publish" siteUrl={siteUrl} linkAs={Link}
  publish={<PublishButton state={publish.state} failedStep={publish.run?.step} onPublish={…} onRetry={…} />} />
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

// Ligne CMS éditable (poignée focalisable pour réordonner : gestionnaires de la feature)
<CMSRow onOpen={() => open(doc._id)} openLabel={`Open ${doc.title}`}>
  <CMSCell type="handle" checkboxLabel={`Select ${doc.title}`} checked={sel} onCheckedChange={toggle}
    gripLabel={`Reorder ${doc.title}`} gripTooltip="Drag to reorder" gripProps={{ ...reorder.gripProps(id, index, title), 'data-grip': id }} />
  <CMSCell type="title" editing={editing} onEditRequest={edit} onCommit={save} onCancel={stop} inputLabel="Title">{doc.title}</CMSCell>
  <CMSCell type="status"><StatusSelect status={status} onAction={runAction} /></CMSCell>
</CMSRow>

// Top bar en échec (G3 état 5) : « See error » juste après le texte d'état
<TopBar state="failed" statusText="Publish failed — previous version still live" linkAs={Link}
  statusAction={<Button variant="ghost" size="small" aria-haspopup="dialog" onClick={openLog}>See error</Button>}
  publish={<PublishButton state="failed" failedStep={run.step} onRetry={retry} />} />

// Liste de contrôle (E1 « After “Publish” ») et actions d'un fichier (C5)
<ol>{steps.map((s) => <ChecklistItem key={s.step} state={s.state} title={s.title} description={s.description} />)}</ol>
<ToolLinks aria-label="File actions">
  <ToolLink icon="replace" label="Replace" onClick={pick} />
  <ToolLink icon="download" label="Download" href={url} download />
  <ToolLink icon="trash" label="Delete" tone="danger" disabled={used} disabledReason="Used in 2 places" onClick={remove} />
</ToolLinks>

// Écran dont l'en-tête Figma est un Section header (B3 Code ; B5 Usage a un Page header : PageHeader)
<SectionHeader headingLevel={1} title="Scripts" description="…" action={<Button …>Add</Button>} />
```
- **Galerie** : section dans `sections/Composites*.tsx` + lien dans `NAV` (KitGallery.tsx).

## Tests

- `npx vitest run src/admin/ui` (143 tests au 2026-09-27) :
  - fondations (96) : Button, Icon (+ fidélité aux SVG), position, Popover, Tooltip, Select, Chip (+ `Chip.css.test.ts` :
    survol limité à l'état), Switch + SettingRow, Checkbox + RadioGroup, SearchField (+ taille small) + Input, ImageUpload
    (+ emplacement `actions`), `motion.test.tsx` (hydratation en mouvement réduit, `reducedVariants`), Toast,
    PublishButton (dont l'annonce par étape, QA-3), CodeBlock, VariableInput, Avatar, FaviconPreview (fond Figma par thème,
    favicon 16 × 16, repli si absent / illisible, Upload / Remove), `tokens.test.ts` (couches) ;
  - composites : Modal (+ `useModalDialog` : fenêtre montée tard, focus déjà placé), Drawer (dont ouvert au montage), Tabs,
    Menu (dont focus initial d'un panneau encore masqué), SegmentedControl, StatusSelect, CMSCell (poignée focalisable,
    remplissage avant Row open), SelectionBar (balisage serveur identique avec / sans mouvement réduit), ListItem (`textGap`),
    TopBar (`statusAction`), SectionHeader (h1), ChecklistItem, ToolLink.
- Non couvert : rendu visuel (hover, pressed, mesures), contrastes, portails dans un vrai navigateur → galerie.
- `npx tsc --noEmit -p .` — zéro erreur dans `src/admin/ui` et `src/app/admin/kit`.
- À la main : `http://127.0.0.1:4040/admin/kit` (dev seulement) — survol (dont Chip actif survolé), Tab, clavier dans Select /
  VariableInput / Menu, toasts, glisser-déposer d'une image, Modal / Drawer (Échap, piège du focus) ; `prefers-reduced-motion`
  dans les outils du navigateur.

## Décisions et « À trancher »

### Fondations (ui-foundations)
- Thème : sombre seul exposé ; Light livré dans les tokens tel que le Figma (inachevé).
- `PublishButton` suit le contrat `PublishState` (`failed`) plutôt que le nom Figma `error`.
- La galerie est sous `src/app/admin/kit/` (route `/admin/kit`), pas `_kit/`.
- Toast : durée 5 s (6 s pour une erreur), `loading` permanent jusqu'à `update`, 3 visibles au plus, le plus récent en bas.
- Couches : `--k-z-overlay: 900` (FOLLOWUPS #10) et `--k-z-panel: 800` pour les panneaux flottants non modaux (FOLLOWUPS #23,
  même valeur que l'ancien `calc(var(--k-z-popover) - 200)` d'ask-ai, qui utilise désormais `var(--k-z-panel)`).
- Chip « on » survolé : pas de variante Figma ; fond `color-mix` 88 % bg/inverse / 12 % bg/input-hover (lisible, retour discret).
- Annonce d'échec de PublishButton selon l'étape (`failedStep`, QA-3) plutôt qu'un texte fourni par l'appelant : le kit
  garde les textes de l'état, l'appelant ne passe qu'une donnée du contrat (`run.step`).

### Composites (ui-composites)
- **Drawer : 810 px** (composant Figma 810 × 900, écran C4 : `abs@630`, 810 de large, LLM context « drawer de 810 px ») ; la
  description du composant (« 440 × 900 ») est périmée. `width` reste réglable.
- StatusSelect est un **bouton de menu** (actions selon l'état, C3 « proposé »), pas une liste de valeurs : on ne « choisit » pas Changed.
- PublishState du contrat (`failed`) pour la Top bar, comme PublishButton (Figma « error »).
- Galerie : section découpée en `sections/CompositesDataDisplay.tsx`, `CompositesNavigation.tsx`, `CompositesOverlays.tsx`
  (Overlays + AI editor), composées par `sections/Composites.tsx`.
- FOLLOWUPS #24 (2026-09-27) : `ListItem.textGap` (option, le défaut reste le composant Figma à 0) ; « See error » dans un
  emplacement `statusAction` du groupe d'état (ordre du G3 : état → See error → Publish) plutôt que dans `publish` ;
  `SectionHeader headingLevel={1}` (même rendu) plutôt qu'un Page header « compact » ; ChecklistItem et ToolLinks ajoutés
  au kit (Data display) d'après E1 / C5 ; poignée focalisable par `gripProps` (le kit ne gère pas le glisser) ; Row open au
  bord droit par un remplissage posé par CMSRow ; focus initial du Menu et des fenêtres : nouvel essai par frame, borné.
  ImageUpload (emplacement d'actions) et SearchField 28 px relèvent des fondations : livrés par ui-foundations (FOLLOWUPS #38).

## Demandes de contrat

- **ui-composites** (Modal, Drawer) : le repli `var(--k-z-overlay, 900)` peut devenir `var(--k-z-overlay)` (facultatif).
- Faites (vérifiées le 2026-09-27) :
  - publish-ui : `PublishStatusBar.tsx` passe `failedStep={status?.run?.step}` à `<PublishButton>` (QA-3) ; `ChecklistItem`
    du kit (`AfterPublishCard.tsx`), `ListItem textGap={2}` (`PendingView.tsx`), `TopBar statusAction` pour « See error ».
  - ask-ai : `AskAiProvider.module.css` utilise `var(--k-z-panel)` (testé par `layout.test.ts`).
  - cms-media (FOLLOWUPS #38 / #40) : `ImageUpload actions` dans `fields/ImageField.tsx` ; `SearchField size="small"` dans
    `ListTools` (plus de `margin-block: -1px`) ; `CMSCell gripProps` / `gripLabel` / `gripTooltip` dans
    `CollectionScreen.tsx`, remplissage avant Row open posé par CMSRow (plus de `.filler` côté cms) ; `useDrawerFocus`
    retiré (le Drawer du kit attend son portail, `drawer-focus.test.tsx`) ; media : `ToolLinks` / `ToolLink` du kit dans
    `MediaDetails.tsx`. `useMotionVariants` garde l'état `initial` en mouvement réduit.
  - code-usage : plus de contournement du focus du Menu dans `ScriptDialog.tsx` ; `SectionHeader headingLevel={1}` dans
    `CodeScreen.tsx` (B3). Usage (B5) utilise `PageHeader`, conforme à son Figma.
  - shell pose la racine admin + `ToastProvider` (`src/app/admin/layout.tsx`) et le défilement de la coque ;
  AGENTS-PLAN ne cite plus `_kit/`.
