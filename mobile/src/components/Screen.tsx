import React from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';

export function Screen({
  children,
  keyboardShouldPersistTaps,
}: {
  children: React.ReactNode;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} contentContainerStyle={{ padding: 16 }}>
        <View style={{ gap: 12 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
