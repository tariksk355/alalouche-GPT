import React from 'react';
import { Text } from 'react-native';
import { Screen } from '../components/Screen';

export function SettingsScreen() {
  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Réglages</Text>
    <Text>Compte, préférences et notifications.</Text>
  </Screen>;
}
