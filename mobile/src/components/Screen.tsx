import React from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ gap: 12 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
