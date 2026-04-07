import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

export function ReservationsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1f1a17' }}>Réservations</Text>
        <Text style={{ marginTop: 8, textAlign: 'center', color: '#6b625a' }}>
          La gestion des réservations arrive bientôt sur mobile.
        </Text>
      </View>
    </SafeAreaView>
  );
}
