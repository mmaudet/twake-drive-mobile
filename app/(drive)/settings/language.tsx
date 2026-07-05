import React from 'react'
import { ScrollView } from 'react-native'
import { RadioButton } from 'react-native-paper'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { useTranslation } from 'react-i18next'
import { LanguagePreference, SUPPORTED_LANGUAGES } from '@/i18n/languages'
import { useLanguagePreference } from '@/i18n/languagePreference'

export default function LanguageSettings() {
  const { t } = useTranslation()
  const { preference, setPreference } = useLanguagePreference()
  return (
    <ScreenContainer>
      <ScrollView>
        <RadioButton.Group
          value={preference}
          onValueChange={v => setPreference(v as LanguagePreference)}
        >
          <RadioButton.Item
            label={t('settings.languageSystem')}
            value="system"
            testID="lang-system"
          />
          {SUPPORTED_LANGUAGES.map(l => (
            <RadioButton.Item
              key={l.code}
              label={l.label}
              value={l.code}
              testID={`lang-${l.code}`}
            />
          ))}
        </RadioButton.Group>
      </ScrollView>
    </ScreenContainer>
  )
}
