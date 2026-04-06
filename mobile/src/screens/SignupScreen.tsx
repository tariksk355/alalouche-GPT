import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';

export function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSignup = async () => {
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await signup({ fullName, phone, email, password });
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } catch (error: any) {
      setSubmitError(error?.message || 'Impossible de créer le compte avec ces informations.');
    } finally {
      setSubmitting(false);
    }
  };

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Créer un compte</Text>
      <Text style={headerSubtitle}>Rejoignez-nous pour commander plus vite et suivre vos commandes.</Text>
    </View>

    <View style={sectionCard}>
      <Text style={fieldLabel}>Nom complet</Text>
      <TextInput placeholder="Votre nom" value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />
      <Text style={fieldLabel}>Téléphone</Text>
      <TextInput placeholder="Votre numéro" value={phone} onChangeText={setPhone} style={inputStyle} placeholderTextColor="#8b837b" keyboardType="phone-pad" editable={!submitting} />
      <Text style={fieldLabel}>Email</Text>
      <TextInput placeholder="vous@email.com" autoCapitalize="none" value={email} onChangeText={setEmail} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />
      <Text style={fieldLabel}>Mot de passe</Text>
      <TextInput placeholder="Choisissez un mot de passe" secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} placeholderTextColor="#8b837b" editable={!submitting} />

      {!!submitError && <Text style={errorText}>{submitError}</Text>}

      <View style={{ marginTop: 10, gap: 8 }}>
        <BrandButton label={submitting ? 'Création...' : "S'inscrire"} onPress={handleSignup} disabled={submitting} />
        <Pressable style={[secondaryButton, submitting && { opacity: 0.6 }]} onPress={() => navigation.navigate('Login')} disabled={submitting}>
          <Text style={secondaryButtonLabel}>J'ai déjà un compte</Text>
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
