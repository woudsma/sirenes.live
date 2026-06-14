import { useEffect, useState } from 'react'

// The three top-level views, each with its own URL so the page is deep-linkable
// and reloading keeps you on the same tab. Dashboard lives at the root.
export type Tab = 'dashboard' | 'events' | 'info'

const TAB_TO_PATH: Record<Tab, string> = {
  dashboard: '/',
  events: '/events',
  info: '/info',
}

function pathToTab(path: string): Tab {
  if (path === '/events') return 'events'
  if (path === '/info') return 'info'
  return 'dashboard'
}

// Lightweight History-API router (no dependency): maps the current path to a tab
// and pushes a new path when the tab changes. The server and Vite both fall back
// to index.html for these paths, so a reload on /info lands on Info.
export function useRoute(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => pathToTab(window.location.pathname))

  useEffect(() => {
    const onPop = () => setTab(pathToTab(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (next: Tab) => {
    if (next === tab) return
    window.history.pushState(null, '', TAB_TO_PATH[next])
    setTab(next)
  }

  return [tab, navigate]
}
