import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { storefrontApi } from '../api/storefront';
import { MenuItem } from '../types/models';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';

export function MenuScreen({ navigation }: any) {
  const [items, setItems] = useState<MenuItem[]>([]);
  useEffect(() => { storefrontApi.listMenu().then(setItems).catch(() => setItems([])); }, []);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  return <Screen>
    <Text style={{ fontSize: 30, fontWeight: '700' }}>Notre Menu</Text>
    {categories.map((category) => (
      <View key={category} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius, padding: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{category}</Text>
        {items.filter((i) => i.category === category).map((item) => (
          <Pressable key={item.id} onPress={() => navigation.navigate('ProductDetail', { item })} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: theme.colors.primary }}>CHF {Number(item.price || 0).toFixed(2)}</Text>
          </Pressable>
        ))}
      </View>
    ))}
  </Screen>;
}
