import React, { useMemo, useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';

export function ProductDetailScreen({ route, navigation }: any) {
  const { item } = route.params;
  const { addLine } = useCart();
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const selectedOptions = useMemo(() => (Array.isArray(item.optionGroups) ? item.optionGroups : []).flatMap((group: any) => {
    const ids = selected[group.id] || [];
    const byId = new Map((group.options || []).map((o: any) => [o.id, o]));
    return ids.map((id: string) => byId.get(id)).filter(Boolean).map((opt: any) => ({ groupId: group.id, optionId: opt.id, groupName: group.name, optionLabel: opt.label, priceDelta: Number(opt.priceDelta || 0) }));
  }), [item, selected]);

  const total = Number(item.price || 0) + selectedOptions.reduce((sum: number, o: any) => sum + Number(o.priceDelta || 0), 0);
  const lineKey = `${item.id}::${selectedOptions.map((o: any) => `${o.groupId}:${o.optionId}`).sort().join('|')}`;

  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>{item.name}</Text>
    <Text>{item.description || ''}</Text>
    <Text style={{ color: '#b5122a', fontWeight: '700' }}>CHF {total.toFixed(2)}</Text>
    {(item.optionGroups || []).map((group: any) => (
      <View key={group.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10 }}>
        <Text style={{ fontWeight: '700' }}>{group.name} {group.required ? '(Obligatoire)' : '(Optionnel)'}</Text>
        {(group.options || []).map((opt: any) => {
          const checked = (selected[group.id] || []).includes(opt.id);
          return <Pressable key={opt.id} onPress={() => {
            setSelected((prev) => {
              const current = prev[group.id] || [];
              if (group.selectionType === 'single') return { ...prev, [group.id]: [opt.id] };
              return checked ? { ...prev, [group.id]: current.filter((id: string) => id !== opt.id) } : { ...prev, [group.id]: [...current, opt.id] };
            });
          }} style={{ paddingVertical: 8 }}>
            <Text>{checked ? '☑' : '☐'} {opt.label} {Number(opt.priceDelta || 0) > 0 ? `(+CHF ${Number(opt.priceDelta).toFixed(2)})` : ''}</Text>
          </Pressable>;
        })}
      </View>
    ))}
    <BrandButton label="Ajouter au panier" onPress={() => {
      addLine({ lineKey, id: item.id, name: item.name, price: total, selectedOptions });
      navigation.navigate('Cart');
    }} />
  </Screen>;
}
