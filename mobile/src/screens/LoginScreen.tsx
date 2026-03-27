import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Connexion</Text>
    <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }} />
    <TextInput placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }} />
    <BrandButton label="Se connecter" onPress={() => login(email, password)} />
    <BrandButton label="Créer un compte" onPress={() => navigation.navigate('Signup')} />
    <BrandButton label="Mot de passe oublié" onPress={() => navigation.navigate('ForgotPassword')} />
  </Screen>;
}
