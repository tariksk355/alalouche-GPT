import React from 'react';
import { Pressable, Text } from 'react-native';
import { theme } from '../theme/theme';

export function BrandButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: theme.colors.primary, padding: 14, borderRadius: theme.radius, opacity: disabled ? 0.6 : 1 }}
    >
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
