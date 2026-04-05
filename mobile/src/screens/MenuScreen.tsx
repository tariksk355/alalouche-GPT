import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!categories.length) {
      setActiveCategory(null);
      return;
    }
    if (!activeCategory || !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const visibleCategory = activeCategory && categories.includes(activeCategory) ? activeCategory : categories[0] || '';
  const visibleItems = useMemo(
    () => items.filter((item) => item.category === visibleCategory),
    [items, visibleCategory],
  );

  return (
    <Screen>
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#f1d4d9',
          backgroundColor: '#fff8f9',
          padding: 16,
        }}
      >
        <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 }}>À LA LOUCHE</Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color: theme.colors.text, marginTop: 4 }}>Notre menu</Text>
        <Text style={{ color: '#4b5563', marginTop: 6, lineHeight: 20 }}>
          Cuisine artisanale, préparée minute. Choisissez votre plat et personnalisez-le facilement.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' }}>
            <Text style={{ color: '#374151', fontWeight: '700', fontSize: 12 }}>Commande rapide</Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' }}>
            <Text style={{ color: '#374151', fontWeight: '700', fontSize: 12 }}>{items.length} plats</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 16,
            paddingVertical: 24,
            paddingHorizontal: 20,
            alignItems: 'center',
            gap: 10,
            backgroundColor: '#fff',
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted, fontWeight: '600' }}>Chargement du menu...</Text>
        </View>
      ) : error ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: '#fecaca',
            backgroundColor: '#fff5f5',
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Text style={{ color: '#b91c1c', fontWeight: '800', marginBottom: 4 }}>Erreur de chargement</Text>
          <Text style={{ color: '#7f1d1d' }}>{error}</Text>
        </View>
      ) : categories.length === 0 ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 16,
            backgroundColor: '#f9fafb',
            padding: 14,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 4 }}>Menu indisponible</Text>
          <Text style={{ color: theme.colors.muted }}>Aucun article n’est disponible pour le moment.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            style={{ marginTop: 2 }}
          >
            {categories.map((category) => {
              const isActive = category === visibleCategory;
              return (
                <Pressable
                  key={category}
                  onPress={() => setActiveCategory(category)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: isActive ? '#1f1a17' : '#f3f4f6',
                    borderWidth: 1,
                    borderColor: isActive ? '#1f1a17' : '#e5e7eb',
                  }}
                >
                  <Text style={{ color: isActive ? '#fff' : '#374151', fontWeight: '700', fontSize: 13 }}>{category}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 16,
              backgroundColor: '#fff',
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 8,
            }}
          >
            <View style={{ marginBottom: 4, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: theme.colors.text }}>{visibleCategory}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>{visibleItems.length} article(s)</Text>
            </View>

            {visibleItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => navigation.navigate('ProductDetail', { item })}
                style={{
                  borderWidth: 1,
                  borderColor: '#eceff3',
                  borderRadius: 14,
                  padding: 10,
                  marginTop: 10,
                  backgroundColor: '#fff',
                }}
              >
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: '#f3f4f6' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 12,
                        backgroundColor: '#f3f4f6',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#e5e7eb',
                      }}
                    >
                      <Text style={{ color: '#9ca3af', fontWeight: '700', fontSize: 12 }}>À la Louche</Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 17 }}>{item.name}</Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 13, marginTop: 3 }} numberOfLines={2}>
                      {item.description?.trim() || 'Préparation maison.'}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                      <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 16 }}>
                        CHF {Number(item.price || 0).toFixed(2)}
                      </Text>
                      <Text style={{ color: '#111827', fontSize: 12, fontWeight: '700' }}>Détails</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
