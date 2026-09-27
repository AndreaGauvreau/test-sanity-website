'use client'

import { useRef, useState } from 'react'

import {
  FilterPopover,
  IconButton,
  Menu,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  SearchField,
  type FilterCondition,
  useShortcut,
  type FilterField,
} from '@/admin/ui'

import styles from './ListTools.module.css'

/**
 * Barre d'outils du CMS et de la médiathèque (G5) : 4 icônes, comme dans Framer.
 * + (pas de fenêtre) · ⇅ menu « Sort by » (un seul tri) · ≡ fenêtre « Filters » (point sur l'icône quand un
 * filtre est actif) · ⌕ l'icône devient un champ, la liste se filtre pendant la frappe, Échap ferme et vide.
 */

export type SortChoice<F extends string, D extends string> = {
  options: readonly { value: F; label: string }[]
  directions: readonly { value: D; label: string }[]
  value: { by: F; direction: D }
  onChange: (value: { by: F; direction: D }) => void
}

export type ListToolsProps<F extends string, D extends string> = {
  add: { label: string; onAdd: () => void; loading?: boolean; disabled?: boolean }
  sort: SortChoice<F, D>
  filter: { fields: readonly FilterField[]; conditions: readonly FilterCondition[]; onChange: (conditions: FilterCondition[]) => void }
  search: { value: string; onChange: (value: string) => void; label: string }
}

export function ListTools<F extends string, D extends string>({ add, sort, filter, search }: ListToolsProps<F, D>) {
  const [searchOpen, setSearchOpen] = useState(search.value !== '')
  const searchButton = useRef<HTMLButtonElement | null>(null)
  const active = filter.conditions.filter((c) => c.value).length
  // « / » ouvre la recherche (comme le raccourci du Search field).
  useShortcut({ key: '/' }, () => setSearchOpen(true), !searchOpen)

  const closeSearch = () => {
    setSearchOpen(false)
    // Rendre le focus à l'icône (le champ disparaît).
    requestAnimationFrame(() => searchButton.current?.focus())
  }

  return (
    <>
      <IconButton icon="plus" label={add.label} onClick={add.onAdd} loading={add.loading} disabled={add.disabled} />
      <Menu
        trigger={<IconButton icon="sort" label="Sort" />}
        placement="bottom-end"
        width={216}
        aria-label="Sort"
      >
        <MenuGroup label="Sort by">
          {sort.options.map((option) => (
            <MenuItem
              key={option.value}
              selected={sort.value.by === option.value}
              keepOpen
              // Changer de critère : le parent choisit le sens par défaut du nouveau critère.
              onSelect={() => sort.onChange({ by: option.value, direction: sort.value.direction })}
            >
              {option.label}
            </MenuItem>
          ))}
        </MenuGroup>
        {sort.directions.length ? (
          <>
            <MenuSeparator />
            <MenuGroup label="Order">
              {sort.directions.map((direction) => (
                <MenuItem
                  key={direction.value}
                  selected={sort.value.direction === direction.value}
                  keepOpen
                  onSelect={() => sort.onChange({ ...sort.value, direction: direction.value })}
                >
                  {direction.label}
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        ) : null}
      </Menu>
      <span className={styles.filter}>
        <FilterPopover
          fields={filter.fields}
          conditions={filter.conditions}
          onConditionsChange={filter.onChange}
          trigger={<IconButton icon="filter" label={active ? `Filter (${active} active)` : 'Filter'} pressed={active > 0} />}
        />
        {active ? <span className={styles.dot} aria-hidden="true" /> : null}
      </span>
      {searchOpen ? (
        <SearchField
          className={styles.search}
          size="small"
          value={search.value}
          onValueChange={search.onChange}
          label={search.label}
          shortcut={false}
          autoFocus
          onClear={() => {
            search.onChange('')
            closeSearch()
          }}
          onBlur={(event) => {
            if (!search.value && !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setSearchOpen(false)
          }}
        />
      ) : (
        <IconButton ref={searchButton} icon="search" label="Search" shortcut="/" onClick={() => setSearchOpen(true)} />
      )}
    </>
  )
}
