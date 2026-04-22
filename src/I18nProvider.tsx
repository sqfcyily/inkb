import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { format, resolveLang, strings } from './i18n'
import type { Lang, LangChoice } from './i18n'

type I18nContextValue = {
  langChoice: LangChoice
  lang: Lang
  setLangChoice: (choice: LangChoice) => void
  t: (key: string, params?: Record<string, string>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [langChoice, setLangChoiceState] = useState<LangChoice>(() => {
    const v = localStorage.getItem('lang') as LangChoice | null
    return v === 'zh' || v === 'en' || v === 'auto' ? v : 'auto'
  })

  const lang = useMemo(() => resolveLang(langChoice), [langChoice])

  useEffect(() => {
    localStorage.setItem('lang', langChoice)
    document.documentElement.lang = lang
  }, [langChoice, lang])

  useEffect(() => {
    if (langChoice !== 'auto') return
    const handler = () => setLangChoiceState('auto')
    window.addEventListener('languagechange', handler)
    return () => window.removeEventListener('languagechange', handler)
  }, [langChoice])

  const setLangChoice = useCallback((choice: LangChoice) => {
    setLangChoiceState(choice)
  }, [])

  const t = useCallback((key: string, params?: Record<string, string>) => {
    const template = strings[lang][key] || strings.en[key] || key
    return params ? format(template, params) : template
  }, [lang])

  const value = useMemo(() => ({ langChoice, lang, setLangChoice, t }), [langChoice, lang, setLangChoice, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
