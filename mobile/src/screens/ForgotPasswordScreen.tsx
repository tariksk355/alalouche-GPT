import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { authApi } from '../api/auth';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  return <Screen>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Mot de passe oublié</Text>
    <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={inputStyle} autoCapitalize="none" />
    <BrandButton label="Envoyer" onPress={() => authApi.forgotPassword({ email })} />
  </Screen>;
}
const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
