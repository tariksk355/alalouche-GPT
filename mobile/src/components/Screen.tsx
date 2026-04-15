import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OUTER_CONTENT_PADDING = 16;
const CONTENT_MAX_WIDTH = 720;

export const centeredContentContainerStyle = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
} as const;

export const screenScrollContentStyle = {
  padding: OUTER_CONTENT_PADDING,
} as const;

const OUTER_CONTENT_PADDING = 16;
const CONTENT_MAX_WIDTH = 720;

export const centeredContentContainerStyle = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
} as const;

export const screenScrollContentStyle = {
  padding: OUTER_CONTENT_PADDING,
} as const;

export function Screen({
  children,
  keyboardShouldPersistTaps,
}: {
  children: React.ReactNode;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} contentContainerStyle={screenScrollContentStyle}>
        <View style={[centeredContentContainerStyle, { gap: 12 }]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
