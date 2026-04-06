import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { AppLanguage, useLanguage } from '../contexts/LanguageContext';

export function SettingsScreen() {
  const { language, setLanguage, t } = useLanguage();
  const languageOptions: Array<{ code: AppLanguage; label: string }> = [
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English' },
    { code: 'tr', label: 'Türkçe' },
  ];

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>{t('settings_title')}</Text>
      <Text style={headerSubtitle}>{t('settings_subtitle')}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('settings_language_title')}</Text>
      <Text style={sectionHint}>{t('settings_language_hint')}</Text>
      {languageOptions.map((option) => (
        <Pressable
          key={option.code}
          style={[settingsRow, language === option.code && settingsRowSelected]}
          onPress={() => setLanguage(option.code)}
        >
          <Text style={settingsRowLabel}>{option.label}</Text>
          <Text style={settingsRowValue}>{language === option.code ? '✓' : ''}</Text>
        </Pressable>
      ))}
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('settings_help_title')}</Text>
      <Pressable style={settingsRow} onPress={() => Linking.openURL('mailto:alalouche.fr@gmail.com')}>
        <Text style={settingsRowLabel}>{t('settings_help_label')}</Text>
        <Text style={settingsRowValue}>{t('settings_help_value')}</Text>
      </Pressable>
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('settings_info_title')}</Text>
      <View style={settingsRow}>
        <Text style={settingsRowLabel}>{t('settings_info_app')}</Text>
        <Text style={settingsRowValue}>{t('settings_info_name')}</Text>
      </View>
      <View style={settingsRow}>
        <Text style={settingsRowLabel}>{t('settings_info_version')}</Text>
        <Text style={settingsRowValue}>0.1.0</Text>
      </View>
    </View>
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14, lineHeight: 20 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const sectionTitle = { color: '#1f1a17', fontSize: 16, fontWeight: '800', marginBottom: 4 } as const;
const sectionHint = { color: '#6f675f', fontSize: 13, marginBottom: 8 } as const;
const settingsRow = { borderWidth: 1, borderColor: '#ece6df', borderRadius: 12, backgroundColor: '#fcfbf9', paddingVertical: 11, paddingHorizontal: 12, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as const;
const settingsRowSelected = { borderColor: '#b5122a', backgroundColor: '#fff6f8' } as const;
const settingsRowLabel = { color: '#2b2420', fontWeight: '600' } as const;
const settingsRowValue = { color: '#6f675f', fontSize: 13, fontWeight: '700' } as const;
