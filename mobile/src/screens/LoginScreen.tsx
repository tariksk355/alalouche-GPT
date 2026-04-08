import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleLogin = async () => {
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await login(email, password);
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } catch (error: any) {
      setSubmitError(error?.message || t('login_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return <Screen keyboardShouldPersistTaps="handled">
    <View style={headerCard}>
      <Text style={headerTitle}>{t('login_title')}</Text>
      <Text style={headerSubtitle}>{t('login_subtitle')}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={fieldLabel}>{t('common_email')}</Text>
      <TextInput placeholder={t('placeholder_email')} autoCapitalize="none" value={email} onChangeText={setEmail} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} keyboardType="email-address" returnKeyType="next" />
      <Text style={fieldLabel}>{t('common_password')}</Text>
      <TextInput placeholder={t('login_password_placeholder')} secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} returnKeyType="send" onSubmitEditing={handleLogin} />

      {!!submitError && <Text style={errorText}>{submitError}</Text>}

      <View style={{ marginTop: 10, gap: 8 }}>
        <BrandButton label={submitting ? t('login_loading') : t('login_cta')} onPress={handleLogin} disabled={submitting} />
        <Pressable style={[secondaryButton, submitting && { opacity: 0.6 }]} onPress={() => navigation.navigate('Signup')} disabled={submitting}>
          <Text style={secondaryButtonLabel}>{t('login_create_account')}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ paddingVertical: 4, alignItems: 'center', opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
          <Text style={linkLabel}>{t('login_forgot_password')}</Text>
        </Pressable>
      </View>
    </View>
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14, lineHeight: 20 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const fieldLabel = { color: '#6f675f', fontSize: 12, fontWeight: '700', marginTop: 8 } as const;
const inputStyle = { borderWidth: 1, borderColor: '#e5dfd8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fcfbf9', color: '#1f1a17', marginTop: 6 } as const;
const errorText = { color: '#b91c1c', fontSize: 12, fontWeight: '600', marginTop: 10 } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
const linkLabel = { color: '#7b2a34', fontWeight: '700', fontSize: 13 } as const;
