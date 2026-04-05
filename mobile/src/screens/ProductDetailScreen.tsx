import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';
import { theme } from '../theme/theme';

export function ProductDetailScreen({ route, navigation }: any) {
  const item = route?.params?.item;
  const { addLine } = useCart();
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  if (!item) {
    return (
      <Screen>
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 16, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1f1a17' }}>Produit introuvable</Text>
          <Text style={{ color: '#6b625a', marginTop: 6 }}>Impossible d’afficher les détails de ce produit.</Text>
        </View>
        <BrandButton label="Retour au menu" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const selectedOptions = useMemo(() => (Array.isArray(item.optionGroups) ? item.optionGroups : []).flatMap((group: any) => {
    const ids = selected[group.id] || [];
    const byId = new Map((group.options || []).map((o: any) => [o.id, o]));
    return ids.map((id: string) => byId.get(id)).filter(Boolean).map((opt: any) => ({ groupId: group.id, optionId: opt.id, groupName: group.name, optionLabel: opt.label, priceDelta: Number(opt.priceDelta || 0) }));
  }), [item, selected]);

  const total = Number(item.price || 0) + selectedOptions.reduce((sum: number, o: any) => sum + Number(o.priceDelta || 0), 0);
  const lineKey = `${item.id}::${selectedOptions.map((o: any) => `${o.groupId}:${o.optionId}`).sort().join('|')}`;

  return (
    <Screen>
      <View style={{ borderWidth: 1, borderColor: '#ece7e2', borderRadius: 18, backgroundColor: '#fff', overflow: 'hidden' }}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={{ width: '100%', height: 220, backgroundColor: '#f3f4f6' }} resizeMode="cover" />
        ) : (
          <View style={{ height: 220, backgroundColor: '#f4f1ed', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#9b9188', fontWeight: '700' }}>À la Louche</Text>
          </View>
        )}
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.3 }}>{item.name}</Text>
          <Text style={{ color: '#6b625a', marginTop: 6, lineHeight: 21, fontSize: 15 }}>
            {item.description?.trim() || 'Préparation maison, faite à la commande.'}
          </Text>
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.primary, fontSize: 29, fontWeight: '900' }}>CHF {total.toFixed(2)}</Text>
            <View style={{ backgroundColor: '#eef3f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: '#476255', fontWeight: '700', fontSize: 12 }}>Prix actuel</Text>
            </View>
          </View>
        </View>
      </View>

      {(item.optionGroups || []).map((group: any) => (
        <View key={group.id} style={{ borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, padding: 12, backgroundColor: '#fff' }}>
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: '#1f1a17', fontWeight: '800', fontSize: 17 }}>{group.name}</Text>
            <Text style={{ color: '#7b746d', marginTop: 2, fontSize: 12 }}>
              {group.required ? 'Obligatoire' : 'Optionnel'} · {group.selectionType === 'single' ? '1 choix' : 'Choix multiples'}
            </Text>
          </View>
          {(group.options || []).map((opt: any) => {
            const checked = (selected[group.id] || []).includes(opt.id);
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  setSelected((prev) => {
                    const current = prev[group.id] || [];
                    if (group.selectionType === 'single') return { ...prev, [group.id]: [opt.id] };
                    return checked ? { ...prev, [group.id]: current.filter((id: string) => id !== opt.id) } : { ...prev, [group.id]: [...current, opt.id] };
                  });
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: checked ? '#1f1a17' : '#e8e2dc',
                  backgroundColor: checked ? '#f5f2ef' : '#fff',
                  marginTop: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: '#1f1a17', fontWeight: checked ? '700' : '600', flex: 1 }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: '#6b625a', fontWeight: '700', fontSize: 13 }}>
                    {Number(opt.priceDelta || 0) > 0 ? `+CHF ${Number(opt.priceDelta).toFixed(2)}` : 'Inclus'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 }}>
        <Text style={{ color: '#6b625a', fontSize: 13, marginBottom: 10 }}>Finalisez votre sélection puis ajoutez au panier.</Text>
        <BrandButton
          label={`Ajouter au panier · CHF ${total.toFixed(2)}`}
          onPress={() => {
            addLine({ lineKey, id: item.id, name: item.name, price: total, selectedOptions });
            navigation.navigate('Cart');
          }}
        />
      </View>
    </Screen>
  );
}
