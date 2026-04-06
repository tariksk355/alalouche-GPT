import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { OrderingSettings, storefrontApi } from '../api/storefront';
import { MenuItem } from '../types/models';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useLanguage } from '../contexts/LanguageContext';

export function MenuScreen({ navigation }: any) {
  const { t } = useLanguage();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orderingSettings, setOrderingSettings] = useState<OrderingSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      storefrontApi.listMenu(),
      storefrontApi.getOrderingSettings().catch(() => ({} as OrderingSettings)),
    ])
      .then(([nextItems, nextOrderingSettings]) => {
        if (!mounted) return;
        setItems(Array.isArray(nextItems) ? nextItems : []);
        setOrderingSettings(nextOrderingSettings || {});
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
        setOrderingSettings({});
        setError(t('menu_load_error'));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const categories = useMemo(() => {
    const discovered = Array.from(new Set(items.map((i) => (typeof i.category === 'string' ? i.category.trim() : '')).filter(Boolean)));
    const configuredOrder = Array.isArray(orderingSettings?.categoryOrder)
      ? orderingSettings.categoryOrder.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
      : [];
    const ordered = Array.from(new Set(configuredOrder));
    return [...ordered, ...discovered.filter((category) => !ordered.includes(category))];
  }, [items, orderingSettings?.categoryOrder]);
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
    () => {
      const categoryItems = items.filter((item) => item.category === visibleCategory);
      const configuredOrder = Array.isArray(orderingSettings?.productOrderByCategory?.[visibleCategory])
        ? orderingSettings.productOrderByCategory?.[visibleCategory]
        : [];
      if (!configuredOrder || configuredOrder.length === 0) {
        return categoryItems;
      }
      const indexById = new Map(configuredOrder.map((id, index) => [id, index]));
      return [...categoryItems].sort((a, b) => {
        const aIndex = indexById.has(a.id) ? indexById.get(a.id) : Number.POSITIVE_INFINITY;
        const bIndex = indexById.has(b.id) ? indexById.get(b.id) : Number.POSITIVE_INFINITY;
        if (aIndex !== bIndex) return Number(aIndex) - Number(bIndex);
        return 0;
      });
    },
    [items, visibleCategory, orderingSettings?.productOrderByCategory],
  );

  return (
    <Screen>
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#ebe7e3',
          backgroundColor: '#f9f7f4',
          paddingVertical: 12,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              color: '#1f1a17',
              fontSize: 34,
              fontFamily: 'serif',
              fontStyle: 'italic',
              fontWeight: '500',
              letterSpacing: 0.4,
            }}
          >
            {t('menu_brand_name')}
          </Text>
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
          <Text style={{ color: theme.colors.muted, fontWeight: '600' }}>{t('menu_loading')}</Text>
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
          <Text style={{ color: '#b91c1c', fontWeight: '800', marginBottom: 4 }}>{t('menu_load_error_title')}</Text>
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
          <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 4 }}>{t('menu_unavailable_title')}</Text>
          <Text style={{ color: theme.colors.muted }}>{t('menu_unavailable_copy')}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: 2 }}
            style={{ marginTop: 4 }}
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
                    backgroundColor: isActive ? '#25201d' : '#f3f1ee',
                    borderWidth: 1,
                    borderColor: isActive ? '#25201d' : '#e7e2dc',
                  }}
                >
                  <Text style={{ color: isActive ? '#fff' : '#5f5750', fontWeight: '700', fontSize: 13 }}>{category}</Text>
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
            <View style={{ marginBottom: 6, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ fontSize: 21, fontWeight: '800', color: theme.colors.text }}>{visibleCategory}</Text>
                <Text style={{ color: '#7b746d', fontSize: 14, marginTop: 2 }}>{t('menu_home_selection')}</Text>
              </View>
              <Text style={{ color: '#7b746d', fontSize: 14 }}>{t('menu_items_count').replace('{count}', String(visibleItems.length))}</Text>
            </View>

            {visibleItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => navigation.navigate('ProductDetail', { item })}
                style={{
                  borderWidth: 1,
                  borderColor: '#ece7e2',
                  borderRadius: 16,
                  padding: 12,
                  marginTop: 10,
                  backgroundColor: '#fff',
                }}
              >
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1f1a17', fontWeight: '800', fontSize: 19 }}>{item.name}</Text>
                    <Text style={{ color: '#6b625a', fontSize: 15, marginTop: 4, lineHeight: 20 }} numberOfLines={2}>
                      {item.description?.trim() || t('menu_default_description')}
                    </Text>
                    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: '#111111', fontWeight: '900', fontSize: 22 }}>
                        CHF {Number(item.price || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: 95, height: 95, borderRadius: 12, backgroundColor: '#f3f4f6' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 95,
                          height: 95,
                          borderRadius: 12,
                          backgroundColor: '#f2efea',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: '#e7e2dc',
                        }}
                      >
                        <Text style={{ color: '#938a80', fontWeight: '700', fontSize: 12 }}>{t('menu_brand_name')}</Text>
                      </View>
                    )}

                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#211c19',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 18, lineHeight: 18 }}>+</Text>
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
