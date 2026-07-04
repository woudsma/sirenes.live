import { useEffect, useState, type ReactNode } from 'react'
import { LanguageContext, STORAGE_KEY, type Lang } from './i18n'

// The language context provider. Kept in its own file (component-only) so React
// Fast Refresh works; the context, hook, and translation data live in i18n.tsx.

function readInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'nl') return stored
  return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (next: Lang) => setLangState(next)
  const toggle = () => setLangState((prev) => (prev === 'en' ? 'nl' : 'en'))

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}
