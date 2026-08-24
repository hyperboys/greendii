'use client'

import { useEffect, useState } from 'react'

export interface PersistentListState<TFilters = Record<string, unknown>, TSorting = Record<string, unknown>> {
  filters: TFilters
  pagination: { page: number; pageSize: number }
  sorting: TSorting
  selectedTab: string | null
  scrollPosition: number
  shouldRestore: boolean
}

const STORAGE_PREFIX = 'greendii:list-state:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readState<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return defaults
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.shouldRestore !== true) return defaults
    return isRecord(defaults) ? { ...defaults, ...parsed } as T : defaults
  } catch {
    return defaults
  }
}

export function armPersistentListState(key: string) {
  if (typeof window === 'undefined') return
  try {
    const storageKey = `${STORAGE_PREFIX}${key}`
    const current = JSON.parse(window.sessionStorage.getItem(storageKey) || '{}')
    window.sessionStorage.setItem(storageKey, JSON.stringify({ ...current, shouldRestore: true }))
  } catch {
    // Ignore unavailable or malformed session storage.
  }
}

export function usePersistentListState<T extends Record<string, unknown>>(key: string, defaults: T) {
  const [state, setState] = useState<T>(defaults)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setState(readState(key, defaults))
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated || !state.shouldRestore) return
    setState(prev => ({ ...prev, shouldRestore: false }))
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(state))
    } catch {
      // Storage can be unavailable in private browsing or under restrictive policies.
    }
  }, [hydrated, key, state])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    const onScroll = () => setState(prev => ({ ...prev, scrollPosition: window.scrollY }))
    window.addEventListener('scroll', onScroll, { passive: true })
    const scrollPosition = typeof state.scrollPosition === 'number' ? state.scrollPosition : 0
    window.scrollTo(0, scrollPosition)
    return () => window.removeEventListener('scroll', onScroll)
  }, [hydrated, key])

  const clear = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`)
    setState(defaults)
  }

  return { state, setState, hydrated, clear }
}
