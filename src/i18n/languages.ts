export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'de' | 'vi' | 'ru'

/** Stored language choice: a concrete code, or 'system' to follow the OS. */
export type LanguagePreference = LanguageCode | 'system'

export interface LanguageDef {
  code: LanguageCode
  /** Autonym — the language's own name, shown identically in every locale. */
  label: string
}

export const SUPPORTED_LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ru', label: 'Русский' }
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function isSupportedLanguage(code?: string | null): code is LanguageCode {
  return !!code && SUPPORTED_LANGUAGES.some(l => l.code === code)
}

/**
 * Resolve the effective language from a stored preference and the device's
 * ordered locale list. A concrete supported preference wins; otherwise the first
 * supported device locale is used; otherwise English.
 */
export function pickLanguage(
  preference: LanguagePreference | null | undefined,
  deviceLocales: { languageCode?: string | null }[]
): LanguageCode {
  if (preference && preference !== 'system' && isSupportedLanguage(preference)) return preference
  for (const locale of deviceLocales) {
    if (isSupportedLanguage(locale.languageCode)) return locale.languageCode
  }
  return DEFAULT_LANGUAGE
}
