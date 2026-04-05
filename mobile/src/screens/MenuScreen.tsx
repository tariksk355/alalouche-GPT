import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { storefrontApi } from '../api/storefront';
import { MenuItem } from '../types/models';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';

export function MenuScreen({ navigation }: any) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    storefrontApi
      .listMenu()
      .then((nextItems) => {
        if (!mounted) return;
        setItems(Array.isArray(nextItems) ? nextItems : []);
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
        setError('Impossible de charger le menu pour le moment.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  return (
    <Screen>
      <View style={{ marginBottom: 6 }}>
        <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>À LA LOUCHE</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', color: theme.colors.text, marginTop: 4 }}>Notre menu</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6, lineHeight: 20 }}>
          Choisissez vos plats, personnalisez-les puis ajoutez-les au panier.
        </Text>
      </View>

      {loading ? (
        <View style={{ marginTop: 22, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius, padding: 20, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted, fontWeight: '600' }}>Chargement du menu...</Text>
        </View>
      ) : error ? (
        <View style={{ marginTop: 22, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: theme.radius, padding: 14 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '700', marginBottom: 4 }}>Erreur</Text>
          <Text style={{ color: '#7f1d1d' }}>{error}</Text>
        </View>
      ) : categories.length === 0 ? (
        <View style={{ marginTop: 22, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius, backgroundColor: '#f9fafb', padding: 14 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 4 }}>Menu indisponible</Text>
          <Text style={{ color: theme.colors.muted }}>Aucun article n’est disponible pour le moment.</Text>
        </View>
      ) : (
        categories.map((category) => {
          const categoryItems = items.filter((i) => i.category === category);
          return (
            <View
              key={category}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius,
                padding: 14,
                marginTop: 14,
                backgroundColor: '#fff',
              }}
            >
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>{category}</Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>{categoryItems.length} article(s)</Text>
              </View>

              {categoryItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => navigation.navigate('ProductDetail', { item })}
                  style={{
                    borderWidth: 1,
                    borderColor: '#eef2f7',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    marginTop: 8,
                    backgroundColor: '#fafafa',
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
                  {item.description ? (
                    <Text style={{ color: theme.colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 15 }}>
                      CHF {Number(item.price || 0).toFixed(2)}
                    </Text>
                    <Text style={{ color: '#374151', fontWeight: '700', fontSize: 12 }}>Voir le produit →</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </Screen>
  );
}
