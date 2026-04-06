import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subscribedEmail, setSubscribedEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSignup = async () => {
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await signup({ fullName, phone, email, password, subscribedEmail });
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } catch (error: any) {
      setSubmitError(error?.message || t('signup_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>{t('signup_title')}</Text>
      <Text style={headerSubtitle}>{t('signup_subtitle')}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={fieldLabel}>{t('common_full_name')}</Text>
      <TextInput placeholder={t('signup_name_placeholder')} value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />
      <Text style={fieldLabel}>{t('common_phone')}</Text>
      <TextInput placeholder={t('signup_phone_placeholder')} value={phone} onChangeText={setPhone} style={inputStyle} placeholderTextColor="#8b837b" keyboardType="phone-pad" editable={!submitting} />
      <Text style={fieldLabel}>{t('common_email')}</Text>
      <TextInput placeholder={t('placeholder_email')} autoCapitalize="none" value={email} onChangeText={setEmail} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />
      <Text style={fieldLabel}>{t('common_password')}</Text>
      <TextInput placeholder={t('signup_password_placeholder')} secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />

      <Pressable style={consentCard} onPress={() => !submitting && setSubscribedEmail((prev) => !prev)} disabled={submitting}>
        <View style={[checkboxBase, subscribedEmail && checkboxChecked, submitting && { opacity: 0.6 }]}>
          {subscribedEmail && <Text style={checkboxTick}>✓</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={consentTitle}>{t('signup_marketing_title')}</Text>
          <Text style={consentHint}>{t('signup_marketing_hint')}</Text>
        </View>
      </Pressable>

      {!!submitError && <Text style={errorText}>{submitError}</Text>}

      <View style={{ marginTop: 10, gap: 8 }}>
        <BrandButton label={submitting ? t('signup_loading') : t('signup_cta')} onPress={handleSignup} disabled={submitting} />
        <Pressable style={[secondaryButton, submitting && { opacity: 0.6 }]} onPress={() => navigation.navigate('Login')} disabled={submitting}>
          <Text style={secondaryButtonLabel}>{t('signup_have_account')}</Text>
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
const consentCard = { marginTop: 12, borderWidth: 1, borderColor: '#e6dfd8', borderRadius: 13, backgroundColor: '#f8f6f3', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' } as const;
const checkboxBase = { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#c2b9b1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1 } as const;
const checkboxChecked = { backgroundColor: '#b5122a', borderColor: '#b5122a' } as const;
const checkboxTick = { color: '#fff', fontSize: 12, fontWeight: '800' } as const;
const consentTitle = { color: '#1f1a17', fontSize: 13, fontWeight: '700' } as const;
const consentHint = { color: '#6f675f', fontSize: 12, marginTop: 3, lineHeight: 17 } as const;
const errorText = { color: '#b91c1c', fontSize: 12, fontWeight: '600', marginTop: 10 } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
