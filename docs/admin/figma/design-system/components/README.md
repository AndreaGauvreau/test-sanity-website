# Composants — index par famille

Source : Figma « Kuartz — Carte système » (`wvr98llwHnMufQ88qUp4Ih`), page « 🎨 Design System ». Famille « Kuartz hub » hors périmètre.
Chaque fiche `<Nom>.md` est accompagnée de sa capture `<Nom>.png` (le COMPONENT_SET entier, rendu 1×). Pour 27 petits composants dont la capture seule pesait moins de 5 Ko, la capture est celle du cadre de documentation `group/<Nom>` (titre + description + composant) ; la fiche le signale en fin de fichier.
Le rôle ci-dessous reprend le début de la description Figma du composant (texte complet dans la section « Rôle » de chaque fiche).

## Actions (3)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Button | [Button.md](./Button.md) | `111:286` | 40 var. | Bouton d'action. primary = action principale (Publish, Apply) ; secondary = action courante ; ghost = action discrète ; danger = suppression. |
| Icon button | [IconButton.md](./IconButton.md) | `321:393` | 24 var. | Bouton à icône seule. Icône interchangeable (propriété Icon) ; la couleur suit le style et l'état. |
| Chip | [Chip.md](./Chip.md) | `321:421` | 4 var. | Pastille bascule. Propriétés : Label, Show icon, Icon (12 px). |

## Feedback (8)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Tag | [Tag.md](./Tag.md) | `142:38` | 6 var. | Statut court. tone : neutral, info (KUARTZ), success (CLIENT, Ready), warning (Draft, changements), error (Failed), inverse (Live). |
| Kbd | [Kbd.md](./Kbd.md) | `323:181` | unique | Touche clavier. Propriété Label. |
| Tooltip | [Tooltip.md](./Tooltip.md) | `323:189` | unique | Infobulle. Propriétés : Label, Show shortcut. |
| Progress bar | [ProgressBar.md](./ProgressBar.md) | `323:235` | 10 var. | Jauge 240 px : étirer l'instance, le remplissage suit la proportion. value en variantes (0, 25, 50, 75, 100). |
| Callout | [Callout.md](./Callout.md) | `323:316` | 5 var. | Note contextuelle. Propriétés : Text, Show action (bouton ghost). |
| Toast | [Toast.md](./Toast.md) | `323:412` | 4 var. | Notification temporaire (4–6 s), en bas au centre. Modifier le message directement dans le calque « message ». |
| Empty state | [EmptyState.md](./EmptyState.md) | `323:432` | unique | État vide. Propriétés : Title, Description, Show action, Icon. |
| Publish button | [PublishButton.md](./PublishButton.md) | `323:503` | 5 var. | idle : tout est publié (désactivé) · pending : modifications en attente · publishing : en cours (le code déclenche un build Vercel) · published : confirmation 3 s · error : rien n'a changé, réessayer. |

## Forms (16)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Input | [Input.md](./Input.md) | `327:352` | 10 var. | Champ texte. Propriétés : Label, Value, Placeholder (état empty), Helper (compteur « 42 / 60 » ou message d'erreur), Show label, Show helper, Show icon, Icon. |
| Textarea | [Textarea.md](./Textarea.md) | `327:436` | 10 var. | Texte multiligne (88 px, redimensionnable). Mêmes propriétés que Input, sans icône. |
| Select | [Select.md](./Select.md) | `327:520` | 8 var. | Liste déroulante. state=open montre le champ actif ; la liste est un Menu posé dessous. |
| Search field | [SearchField.md](./SearchField.md) | `327:554` | 3 var. | Recherche 28 px. Propriétés : Value, Placeholder, Show shortcut. state=filled affiche ✕ pour effacer. |
| Checkbox | [Checkbox.md](./Checkbox.md) | `330:283` | 5 var. | Case à cocher 16 px. Propriétés : Label, Show label. |
| Radio | [Radio.md](./Radio.md) | `330:305` | 4 var. | Bouton radio 16 px. Propriétés : Label, Show label. |
| Switch | [Switch.md](./Switch.md) | `330:329` | 4 var. | Interrupteur 32 × 18. Propriétés : Label, Show label. |
| Setting row | [SettingRow.md](./SettingRow.md) | `330:341` | unique | Réglage avec Switch (instance exposée : changer son état depuis le panneau). |
| Image upload | [ImageUpload.md](./ImageUpload.md) | `330:408` | 4 var. | Envoi d'image. Remplacer l'aperçu (état filled) par l'image réelle. Propriétés : Label, Hint, Show label. |
| Rich text field | [RichTextField.md](./RichTextField.md) | `330:490` | 2 var. | Éditeur de texte riche (outils : H2, H3, gras, italique, listes, lien). |
| Code block | [CodeBlock.md](./CodeBlock.md) | `330:520` | 3 var. | Bloc de code (Geist Mono 12, style Code). read-only : JSON-LD affiché au client, non modifiable (cadenas). |
| Remove badge | [RemoveBadge.md](./RemoveBadge.md) | `410:1547` | unique | Pastille de suppression d'une image : 18 px, fond bg/strong, croix icon/default, deux ombres légères. |
| Favicon preview | [FaviconPreview.md](./FaviconPreview.md) | `410:1592` | 2 var. | Favicon dans un onglet de navigateur (theme=light\|dark), 180 px de large. |
| Image preview | [ImagePreview.md](./ImagePreview.md) | `410:1609` | 2 var. | Image au ratio 1200 × 630 (1,91 : 1), 375 × 197 par défaut. filled : calque « image » (remplacer l'image) + Remove badge ; empty : « Drop image ». |
| Variable chip | [VariableChip.md](./VariableChip.md) | `445:1898` | unique | Champ CMS (variable) dans un texte : {{title}} s'affiche « title » sur fond violet léger. |
| Variable input | [VariableInput.md](./VariableInput.md) | `445:1918` | unique | Input d'une page article CMS : texte + champs de l'article (Variable chip exposé), bouton d'insertion (icône database) à droite, aide dessous (longueur estimée avec l'article d'aperçu). |

## Data display (15)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Avatar | [Avatar.md](./Avatar.md) | `332:340` | 9 var. | Avatar rond avec initiales. Pour une photo, remplir le cercle avec l’image. |
| List item | [ListItem.md](./ListItem.md) | `337:1064` | 4 var. | Ligne de liste (560 px, étirable). Propriétés : Title, Subtitle, Meta, Show subtitle, Show meta, Show tag (exposé), Show action, Icon. |
| Table cell | [TableCell.md](./TableCell.md) | `337:1191` | 22 var. | Cellule (largeur libre). Propriétés : Label, Show sort (en-tête). Le tag et l'avatar sont exposés. |
| Media card | [MediaCard.md](./MediaCard.md) | `337:1453` | 9 var. | Carte média 184 px. Remplacer la vignette par l'image. Propriétés : Name, Size, Usage (« Used ×2 » ou « Unused »). |
| Version item | [VersionItem.md](./VersionItem.md) | `337:1486` | 3 var. | Ligne de version (380 px). Propriétés : Label, Show tag (exposé : Live = inverse, Failed = error + icône ✕). |
| Detail row | [DetailRow.md](./DetailRow.md) | `337:1498` | 2 var. | Libellé / valeur. Propriétés : Label, Value. |
| Stat card | [StatCard.md](./StatCard.md) | `338:1177` | unique | Chiffre clé (260 px, étirable). Propriétés : Label, Value, Hint, Show hint, Show icon, Icon. |
| AI usage | [AIUsage.md](./AIUsage.md) | `352:1557` | 3 var. | Consommation IA du compte Claude du site, par période : tokens input, tokens output, coût, puis le détail par fonctionnalité avec le modèle (Model usage). |
| Search preview | [SearchPreview.md](./SearchPreview.md) | `338:1231` | unique | Aperçu Google. Propriétés : Site name, URL, Title, Description. |
| Social preview | [SocialPreview.md](./SocialPreview.md) | `338:1245` | unique | Aperçu réseaux sociaux. Remplir le calque « image » avec l'image OG. Propriétés : Domain, Title, Description. |
| Heading row | [HeadingRow.md](./HeadingRow.md) | `338:1337` | 8 var. | Ligne de l'arbre des titres (retrait selon le niveau). Propriétés : Text, Note (message d'alerte). |
| Lock badge | [LockBadge.md](./LockBadge.md) | `453:1923` | 2 var. | Pastille cadenas 24 px (fond bg/scrim) sur une image quand une action est bloquée. |
| Status select | [StatusSelect.md](./StatusSelect.md) | `468:1971` | 3 var. | Statut d'un élément CMS (Live, Draft, Changed) modifiable directement dans le tableau : pastille teintée + chevron. |
| CMS cell | [CMSCell.md](./CMSCell.md) | `468:2013` | 8 var. | Cellule du tableau CMS (tableur) : largeur fixe par colonne (texte 180, titre 240, statut 120, vignette 96, poignée 64), trait droit border/subtle. |
| Row open | [RowOpen.md](./RowOpen.md) | `468:2027` | unique | Bouton « ouvrir dans le panneau » d'une ligne CMS survolée : Icon button secondary (icône open) collé à droite, sur un fondu de la couleur de ligne survolée (#2b2b2b = bg/input-hover), du transparent au plein. |

## Navigation (12)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Nav item | [NavItem.md](./NavItem.md) | `332:431` | 3 var. | Entrée de sidebar (224 × 32). Propriétés : Label, Icon, Show icon, Count, Show count, Show tag (tag exposé : changer libellé et couleur). |
| Nav section | [NavSection.md](./NavSection.md) | `332:443` | unique | Titre de section de sidebar (capitales). Propriétés : Label, Show action. |
| Tab | [Tab.md](./Tab.md) | `332:459` | 3 var. | Onglet. Propriété : Label. |
| Tabs | [Tabs.md](./Tabs.md) | `332:479` | 2 var. | Rangée d’onglets (onglets exposés : état et libellé depuis le panneau). |
| Segment | [Segment.md](./Segment.md) | `332:507` | 6 var. | Segment (libellé ou icône). Propriétés : Label, Icon. |
| Segmented control | [SegmentedControl.md](./SegmentedControl.md) | `332:522` | 4 var. | Groupe de segments. content=label (texte) ou icon (icônes seules : prévoir une infobulle sur chacune). |
| Menu item | [MenuItem.md](./MenuItem.md) | `332:585` | 5 var. | Élément de menu (28 px). Propriétés : Label, Show icon, Icon, Show shortcut. |
| Menu | [Menu.md](./Menu.md) | `332:656` | unique | Menu flottant (ombre Elevation/Popover). Éléments exposés : masquer, renommer ou changer l’état depuis le panneau. |
| Sidebar | [Sidebar.md](./Sidebar.md) | `333:1247` | 2 var. | Sidebar de l'admin d'un site (240 × 900). Sections : SITE SETTINGS, PAGES, CMS (toutes les collections ont l'icône database, leur nom vient de Sanity), ASSETS (Media, partagé par les pages, le CMS et les réglages). |
| Top bar | [TopBar.md](./TopBar.md) | `333:1407` | 5 var. | Barre du haut (1200 × 48, étirable). state = étape de publication : up-to-date, pending, publishing, published, error. |
| Page header | [PageHeader.md](./PageHeader.md) | `333:1416` | unique | En-tête d'écran. Propriétés : Title, Meta, Show meta, Description, Show description. |
| Section header | [SectionHeader.md](./SectionHeader.md) | `333:1433` | unique | Titre de section. Propriétés : Title, Description, Show description, Show action (bouton exposé). |

## Overlays (8)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| .Slot | [Slot.md](./Slot.md) | `336:749` | unique | Contenu à échanger (instance swap). Redimensionnable. |
| Modal | [Modal.md](./Modal.md) | `336:820` | 2 var. | Fenêtre modale 480 px (ombre Elevation/Modal), posée sur un Scrim. Propriétés : Title, Description, Show description, Show content (slot à échanger), Show footer. |
| Scrim | [Scrim.md](./Scrim.md) | `336:825` | unique | Voile bg/scrim (noir 60 %). Étirer à la taille de l’écran. |
| Drawer | [Drawer.md](./Drawer.md) | `336:970` | unique | Panneau latéral 440 × 900 (ombre Elevation/Modal) posé sur un Scrim, par-dessus la liste. |
| Filter popover | [FilterPopover.md](./FilterPopover.md) | `336:1030` | unique | Fenêtre de filtres (ombre Elevation/Popover). Dupliquer la ligne « condition » dans une copie détachée si besoin de plusieurs conditions. |
| Usage tooltip | [UsageTooltip.md](./UsageTooltip.md) | `336:1082` | unique | Info-bulle d'usage d'un média : une miniature par emplacement (capture fidèle de la section, média entouré en rouge). |
| Selection bar | [SelectionBar.md](./SelectionBar.md) | `336:1218` | 3 var. | Barre de sélection. delete : partial (une partie verrouillée), allowed, blocked (tout est utilisé). |
| Script dialog | [ScriptDialog.md](./ScriptDialog.md) | `445:1957` | 2 var. | Modale Edit / Add Script (draft). page=all : script sur toutes les pages ou une page. |

## AI editor (12)

| Composant | Fiche | Nœud | Variantes | Rôle |
|---|---|---|---|---|
| Model usage | [ModelUsage.md](./ModelUsage.md) | `427:1565` | 2 var. | Modèle (logo Claude en couleur de marque) + tokens input / output + coût. |
| Editor header | [EditorHeader.md](./EditorHeader.md) | `339:1259` | 2 var. | En-tête de la sidebar Claude sur deux lignes : ← Admin et Publish ↗, puis la consommation de la conversation en cours (Model usage : modèle, tokens input / output, coût). |
| Element chip | [ElementChip.md](./ElementChip.md) | `339:1269` | unique | Élément sélectionné. Propriétés : Label, Show remove. |
| Claude header | [ClaudeHeader.md](./ClaudeHeader.md) | `339:1323` | 5 var. | En-tête du fil de Claude. Modifier la durée et les crédits directement dans le texte d'état. |
| Message | [Message.md](./Message.md) | `339:1339` | 2 var. | Message de l’utilisateur dans le fil. Modifier le texte directement ; les éléments sont des Element chip. |
| Step | [Step.md](./Step.md) | `339:1376` | 6 var. | Étape du fil. Modifier le texte directement. |
| Answer option | [AnswerOption.md](./AnswerOption.md) | `339:1410` | 8 var. | Option de réponse. Modifier le libellé directement. |
| Review card | [ReviewCard.md](./ReviewCard.md) | `339:1458` | 2 var. | Carte de validation. Cancel annule la demande et ses ajustements ; Validate ajoute la modification à Publish. |
| Composer | [Composer.md](./Composer.md) | `340:1429` | 6 var. | Champ de l'éditeur IA. state : empty, ready, multi (Maj + clic), working, waiting (Claude a posé une question), adjust (avant validation). |
| Canvas selection | [CanvasSelection.md](./CanvasSelection.md) | `340:1452` | 3 var. | Contour d'élément (360 × 80, redimensionner à l'élément). Le nom s'affiche au-dessus. |
| Editor toolbar | [EditorToolbar.md](./EditorToolbar.md) | `340:1486` | 2 var. | Barre d'outils flottante (ombre Elevation/Popover), en icônes : œil = View (naviguer), curseur = Select (sélectionner) ; écran, tablette, mobile. |
| Ask AI panel | [AskAIPanel.md](./AskAIPanel.md) | `340:1586` | 2 var. | Fenêtre Ask AI (360 px, ombre Elevation/Popover). state : empty, answered. |

## Lire une fiche

- **Propriétés** : `componentPropertyDefinitions` du COMPONENT_SET (ou du COMPONENT seul). Les noms sont nettoyés du suffixe Figma `#id`. INSTANCE_SWAP : composant par défaut + valeurs préférées.
- **Anatomie** : arbre des calques de la variante par défaut. Une ligne = un calque : `**TYPE** \`nom\` — propriété: valeur · …`.
  - `taille` : largeur×hauteur en px (arrondies à 0,01).
  - `dim` : dimensionnement auto-layout `W <hug|fill|fixed> / H <hug|fill|fixed>`.
  - `layout` : auto-layout `H`/`V`, `gap` (espacement entre enfants ; `auto` = space-between), `pad` dans l’ordre CSS (1 valeur = partout ; 2 = vertical horizontal ; 4 = haut droite bas gauche), `align <axe principal>/<axe secondaire>` (min = start, max = end), `wrap`, `strokes-in-layout` (le contour compte dans la taille, comme `box-sizing: border-box`).
  - `{nom}` après une valeur = **variable Figma liée** (voir `tokens.css` : `{bg/elevated}` → `var(--k-bg-elevated)`, `{space/8}` → `var(--k-space-8)`). Une valeur sans `{…}` est codée en dur dans Figma.
  - `fond` / `contour` : peintures (hex, opacité de peinture en %, variable). Contour : `épaisseur px` + alignement (`inside` = bordure intérieure) ; `h/d/b/g px` si les côtés diffèrent (ex. `0/0/1/0px` = bordure basse seule) ; `dash a,b` = pointillés.
  - `rayon` : `border-radius` (4 valeurs = haut-gauche haut-droite bas-droite bas-gauche). `effet: style Elevation/…` → `var(--k-elevation-…)`. `opacite` : opacité du calque. `clip: oui` = `overflow: hidden`.
  - `pos` : position absolue (x, y dans le parent, contraintes) pour les calques hors auto-layout.
  - Texte : `texte` (contenu d’exemple), `style` (style de texte Figma → `--k-text-*`), `textopt` (alignement, `resize` : `width_and_height` = largeur auto, `height` = largeur fixe/fill et hauteur auto ; `ellipsis` = troncature).
  - Instances : `instance: Composant {variante}`, `props` (valeurs des propriétés de l’instance), `textes` (premiers textes visibles). Les instances ne sont pas dépliées : se reporter à la fiche du composant imbriqué.
  - `modes: Icon color=<mode>` = mode posé sur le calque → couleur des icônes descendantes (`data-icon-color="<mode>"` dans `tokens.css`).
  - `refs` : liaison calque ↔ propriété du composant (`characters←Label` = le texte vient de la propriété Label ; `visible←Show icon` ; `mainComponent←Icon` = icône échangeable).
- **Différences des autres variantes** : pour chaque variante, seules les propriétés qui changent par rapport à une variante de référence (la variante par défaut, ou la même combinaison avec l’état ramené à sa valeur par défaut). `~` modifié, `+` calque ajouté, `−` calque absent ; `(aucun)` = propriété retirée (ex. plus de fond).
- **Tokens et ressources utilisés** : variables, styles de texte, effets, icônes et composants imbriqués rencontrés dans toutes les variantes.
