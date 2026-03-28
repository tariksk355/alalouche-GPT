import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { authApi } from '../api/auth';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';

export function ResetPasswordScreen() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  return <Screen>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Réinitialiser le mot de passe</Text>
    <TextInput placeholder="Token" value={token} onChangeText={setToken} style={inputStyle} autoCapitalize="none" />
    <TextInput placeholder="Nouveau mot de passe" value={password} onChangeText={setPassword} style={inputStyle} secureTextEntry />
    <BrandButton label="Réinitialiser" onPress={() => authApi.resetPassword({ token, password })} />
  </Screen>;
}
const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
