import React from 'react';
import { Text } from 'react-native';
import { Screen } from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { BrandButton } from '../components/BrandButton';

export function ProfileScreen() {
  const { session, logout } = useAuth();
  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Profil</Text>
    <Text>{session?.customer?.fullName || '-'}</Text>
    <Text>{session?.customer?.email || '-'}</Text>
    <BrandButton label="Se déconnecter" onPress={() => logout()} />
  </Screen>;
}
