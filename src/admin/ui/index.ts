/**
 * Kit UI de l'admin — exports publics (ui-foundations ; ui-composites ajoute les siens à la suite).
 * CSS global à importer UNE fois par le layout de l'admin : `@/admin/ui/tokens.css` puis `@/admin/ui/base.css`.
 * Polices : `import { adminFontClassName } from '@/admin/ui/fonts'` (non réexporté ici : next/font ne se charge
 * que dans un module compilé par Next, pas dans les tests).
 */

// Fondations
export * from './icons'
export * from './motion-presets'
export { AnimatePresence, motion, MotionConfig, useReducedMotion, useMotionVariants, useMotionTransition } from './motion'
export { cx } from './utils/cx'
export { mergeRefs, assignRef } from './utils/refs'
export { useControllableState } from './utils/useControllableState'
export { useShortcut, useShortcutLabel, shortcutLabel, matchesShortcut, isApplePlatform, isEditableTarget, type Shortcut } from './utils/shortcut'

// Primitive commune des éléments flottants
export * from './Popover'
export * from './OptionList'

// Actions
export * from './Button'
export * from './IconButton'
export * from './Chip'

// Feedback
export * from './Tag'
export * from './Kbd'
export * from './Tooltip'
export * from './ProgressBar'
export * from './Callout'
export * from './Toast'
export * from './EmptyState'
export * from './PublishButton'

// Forms
export * from './Field'
export * from './Input'
export * from './Textarea'
export * from './Select'
export * from './SearchField'
export * from './Checkbox'
export * from './Radio'
export * from './Switch'
export * from './SettingRow'
export * from './ImageUpload'
export * from './CodeBlock'
export * from './RemoveBadge'
export * from './FaviconPreview'
export * from './ImagePreview'
export * from './VariableChip'
export * from './VariableInput'

// Data display (feuille)
export * from './Avatar'

// ── ui-composites : Data display, Navigation, Overlays, AI editor (partagé) ──

// Data display
export * from './ListItem'
export * from './TableCell'
export * from './MediaCard'
export * from './VersionItem'
export * from './DetailRow'
export * from './StatCard'
export * from './AIUsage'
export * from './SearchPreview'
export * from './SocialPreview'
export * from './HeadingRow'
export * from './LockBadge'
export * from './StatusSelect'
export * from './CMSCell'
export * from './RowOpen'
export * from './ChecklistItem'
export * from './ToolLink'

// Navigation
export * from './NavItem'
export * from './NavSection'
export * from './Tabs'
export * from './SegmentedControl'
export * from './Menu'
export * from './Sidebar'
export * from './TopBar'
export * from './PageHeader'
export * from './SectionHeader'
export * from './ContentArea'

// Overlays
export * from './Scrim'
export * from './Modal'
export * from './Drawer'
export * from './FilterPopover'
export * from './UsageTooltip'
export * from './SelectionBar'

// AI editor (partagé)
export * from './ModelUsage'
