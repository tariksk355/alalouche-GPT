import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useAuth } from '../contexts/AuthContext';

export function SignupScreen() {
  const { signup } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Créer un compte</Text>
    <TextInput placeholder="Nom" value={fullName} onChangeText={setFullName} style={inputStyle} />
    <TextInput placeholder="Téléphone" value={phone} onChangeText={setPhone} style={inputStyle} />
    <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={inputStyle} />
    <TextInput placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} />
    <BrandButton label="S'inscrire" onPress={() => signup({ fullName, phone, email, password })} />
  </Screen>;
}
const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
