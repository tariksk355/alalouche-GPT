import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { authApi } from '../api/auth';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useLanguage } from '../contexts/LanguageContext';

export function ResetPasswordScreen({ navigation }: any) {
  const { t } = useLanguage();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>{t('reset_title')}</Text>
      <Text style={headerSubtitle}>{t('reset_subtitle')}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={fieldLabel}>{t('reset_token_label')}</Text>
      <TextInput placeholder={t('reset_token_placeholder')} value={token} onChangeText={setToken} style={inputStyle} autoCapitalize="none" placeholderTextColor="#8b837b" />
      <Text style={fieldLabel}>{t('reset_new_password_label')}</Text>
      <TextInput placeholder={t('reset_new_password_placeholder')} value={password} onChangeText={setPassword} style={inputStyle} secureTextEntry placeholderTextColor="#8b837b" />

      <View style={{ marginTop: 10, gap: 8 }}>
        <BrandButton label={t('reset_cta')} onPress={() => authApi.resetPassword({ token, password })} />
        <Pressable style={secondaryButton} onPress={() => navigation.navigate('Login')}>
          <Text style={secondaryButtonLabel}>{t('forgot_back_login')}</Text>
        </Pressable>
      </View>
    </View>
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 29, fontWeight: '800', letterSpacing: -0.3 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14, lineHeight: 20 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const fieldLabel = { color: '#6f675f', fontSize: 12, fontWeight: '700', marginTop: 8 } as const;
const inputStyle = { borderWidth: 1, borderColor: '#e5dfd8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fcfbf9', color: '#1f1a17', marginTop: 6 } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
