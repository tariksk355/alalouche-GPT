import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';
import { theme } from '../theme/theme';
import { useLanguage } from '../contexts/LanguageContext';

export function ProductDetailScreen({ route, navigation }: any) {
  const { t } = useLanguage();
  const item = route?.params?.item;
  const { addLine } = useCart();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  if (!item) {
    return (
      <Screen>
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 16, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1f1a17' }}>{t('product_not_found_title')}</Text>
          <Text style={{ color: '#6b625a', marginTop: 6 }}>{t('product_not_found_copy')}</Text>
        </View>
        <BrandButton label={t('product_back_to_menu')} onPress={() => navigation.goBack()} />
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
          <Pressable onPress={() => setImageViewerOpen(true)}>
            <Image source={{ uri: item.imageUrl }} style={{ width: '100%', height: 220, backgroundColor: '#f3f4f6' }} resizeMode="cover" />
          </Pressable>
        ) : (
          <View style={{ height: 220, backgroundColor: '#f4f1ed', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#9b9188', fontWeight: '700' }}>{t('menu_brand_name')}</Text>
          </View>
        )}
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.3 }}>{item.name}</Text>
          <Text style={{ color: '#6b625a', marginTop: 6, lineHeight: 21, fontSize: 15 }}>
            {item.description?.trim() || t('product_default_description')}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 29, fontWeight: '900' }}>CHF {total.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {(item.optionGroups || []).map((group: any) => (
        <View key={group.id} style={{ borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, padding: 12, backgroundColor: '#fff' }}>
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: '#1f1a17', fontWeight: '800', fontSize: 17 }}>{group.name}</Text>
            <Text style={{ color: '#7b746d', marginTop: 2, fontSize: 12 }}>
              {group.required ? t('product_required') : t('product_optional')} · {group.selectionType === 'single' ? t('product_single_choice') : t('product_multiple_choice')}
            </Text>
          </View>
          {(group.options || []).map((opt: any) => {
            const checked = (selected[group.id] || []).includes(opt.id);
            const isSingle = group.selectionType === 'single';
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
                  paddingVertical: 11,
                  paddingHorizontal: 11,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: checked ? '#1f1a17' : '#e5dfd8',
                  backgroundColor: checked ? '#f6f3f0' : '#fff',
                  marginTop: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={
                        isSingle
                          ? {
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              borderWidth: 2,
                              borderColor: checked ? '#1f1a17' : '#b5aca3',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: '#fff',
                            }
                          : {
                              width: 20,
                              height: 20,
                              borderRadius: 6,
                              borderWidth: 2,
                              borderColor: checked ? '#1f1a17' : '#b5aca3',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: '#fff',
                            }
                      }
                    >
                      {checked ? (
                        isSingle ? (
                          <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#1f1a17' }} />
                        ) : (
                          <Text style={{ color: '#1f1a17', fontSize: 12, fontWeight: '900', lineHeight: 12 }}>✓</Text>
                        )
                      ) : null}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#1f1a17', fontWeight: checked ? '700' : '600' }}>{opt.label}</Text>
                      <Text style={{ color: '#8a8077', fontSize: 11, marginTop: 2 }}>
                        {isSingle ? t('product_single_label') : t('product_multi_label')}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: '#6b625a', fontWeight: '700', fontSize: 13 }}>
                    {Number(opt.priceDelta || 0) > 0 ? `+CHF ${Number(opt.priceDelta).toFixed(2)}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 }}>
        <Text style={{ color: '#6b625a', fontSize: 13, marginBottom: 10 }}>{t('product_finalize_copy')}</Text>
        <BrandButton
          label={`${t('product_add_to_cart')} · CHF ${total.toFixed(2)}`}
          onPress={() => {
            addLine({ lineKey, id: item.id, name: item.name, price: total, selectedOptions });
            navigation.navigate('Cart');
          }}
        />
      </View>

      <Modal visible={imageViewerOpen} animationType="fade" transparent onRequestClose={() => setImageViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
          <Pressable
            onPress={() => setImageViewerOpen(false)}
            style={{ position: 'absolute', top: 48, right: 18, zIndex: 20, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common_close')}</Text>
          </Pressable>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 54 }}
            maximumZoomScale={3}
            minimumZoomScale={1}
            pinchGestureEnabled
          >
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={{ width: '100%', height: 420, borderRadius: 14, backgroundColor: '#111' }}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}
