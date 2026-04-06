import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Connexion</Text>
      <Text style={headerSubtitle}>Heureux de vous revoir. Connectez-vous pour reprendre votre commande.</Text>
    </View>

    <View style={sectionCard}>
      <Text style={fieldLabel}>Email</Text>
      <TextInput placeholder="vous@email.com" autoCapitalize="none" value={email} onChangeText={setEmail} style={inputStyle} placeholderTextColor="#8b837b" />
      <Text style={fieldLabel}>Mot de passe</Text>
      <TextInput placeholder="Votre mot de passe" secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} placeholderTextColor="#8b837b" />

      <View style={{ marginTop: 10, gap: 8 }}>
        <BrandButton label="Se connecter" onPress={() => login(email, password)} />
        <Pressable style={secondaryButton} onPress={() => navigation.navigate('Signup')}>
          <Text style={secondaryButtonLabel}>Créer un compte</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ paddingVertical: 4, alignItems: 'center' }}>
          <Text style={linkLabel}>Mot de passe oublié ?</Text>
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

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
const linkLabel = { color: '#7b2a34', fontWeight: '700', fontSize: 13 } as const;
