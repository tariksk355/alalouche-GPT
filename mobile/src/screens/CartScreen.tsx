import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';

export function CartScreen({ navigation }: any) {
  const { lines, updateQty, removeLine } = useCart();
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Panier</Text>
    {lines.map((line) => <View key={line.lineKey} style={{ borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10 }}>
      <Text style={{ fontWeight: '700' }}>{line.name}</Text>
      {line.selectedOptions.map((opt, idx) => <Text key={`${line.lineKey}-${idx}`} style={{ color: '#6b7280' }}>- {opt.groupName}: {opt.optionLabel}</Text>)}
      <Text>CHF {line.price.toFixed(2)} × {line.quantity}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <BrandButton label="-" onPress={() => updateQty(line.lineKey, -1)} />
        <BrandButton label="+" onPress={() => updateQty(line.lineKey, 1)} />
        <BrandButton label="Suppr" onPress={() => removeLine(line.lineKey)} />
      </View>
    </View>)}
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Total CHF {total.toFixed(2)}</Text>
    <BrandButton label="Passer au checkout" onPress={() => navigation.navigate('Checkout')} />
  </Screen>;
}
