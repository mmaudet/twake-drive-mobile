// Native display name per language code. Kept here (not in the translation
// files) so the language picker can label any locale the i18n bundle contains,
// independently of which translations are shipped. Aliases map country-style
// codes (ge, vn) to the right language.
const NAMES: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
  ge: 'Deutsch',
  vi: 'Tiếng Việt',
  vn: 'Tiếng Việt',
  ru: 'Русский',
  pt: 'Português',
  nl: 'Nederlands'
}

export function localeDisplayName(code: string): string {
  return NAMES[code.toLowerCase()] ?? code.toUpperCase()
}
