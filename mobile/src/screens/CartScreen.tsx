import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useCart } from '../contexts/CartContext';
import { storefrontApi, getDeliveryRuleForPostalCode, normalizePostalCode, PromotionPreview } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function CartScreen({ navigation }: any) {
  const { lines, updateQty, removeLine } = useCart();
  const { session } = useAuth();
  const { t } = useLanguage();

  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [postalCodeInput, setPostalCodeInput] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null);
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionPreview | null>(null);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.price * line.quantity, 0), [lines]);
  const normalizedPostalCode = normalizePostalCode(postalCodeInput);
  const deliveryRule = orderType === 'delivery' ? getDeliveryRuleForPostalCode(normalizedPostalCode) : null;
  const deliveryFee = orderType === 'delivery' ? Number(deliveryRule?.deliveryFee || 0) : 0;
  const minimumOrder = orderType === 'delivery' ? Number(deliveryRule?.minimumOrder || 0) : 0;
  const missingForMinimum = minimumOrder > 0 && subtotal < minimumOrder
    ? Number((minimumOrder - subtotal).toFixed(2))
    : 0;

  const deliveryBlockedMessage = orderType !== 'delivery'
    ? ''
    : !normalizedPostalCode
      ? t('cart_enter_postal')
      : !deliveryRule
        ? t('cart_delivery_unavailable')
        : missingForMinimum > 0
          ? t('cart_minimum_missing').replace('{minimum}', minimumOrder.toFixed(2)).replace('{postal}', normalizedPostalCode).replace('{missing}', missingForMinimum.toFixed(2))
          : '';

  const discountedSubtotal = appliedPromotion?.totalAmount ?? subtotal;
  const discountAmount = Number(appliedPromotion?.discountAmount || 0);
  const finalTotal = discountedSubtotal + deliveryFee;

  useEffect(() => {
    if (!appliedPromotion) return;
    setAppliedPromotion(null);
    setPromoFeedback(t('cart_promo_cart_changed'));
  }, [lines]);

  const applyPromotion = async () => {
    if (!promoInput.trim() || lines.length === 0) return;
    setPromoLoading(true);
    setPromoFeedback(null);

    try {
      const promotion = await storefrontApi.previewPromotion(session?.token || null, {
        promotionCode: promoInput.trim(),
        items: lines.map((line) => ({
          id: line.id,
          price: Number(line.price || 0),
          quantity: line.quantity,
        })),
      });
      setAppliedPromotion(promotion);
      setPromoInput(promotion.promotionCode);
      setPromoFeedback(t('cart_promo_applied'));
    } catch (error: any) {
      setAppliedPromotion(null);
      setPromoFeedback(error?.message || t('cart_promo_apply_error'));
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromotion = () => {
    setAppliedPromotion(null);
    setPromoInput('');
    setPromoFeedback(t('cart_promo_removed'));
  };

  const canCheckout = lines.length > 0 && !deliveryBlockedMessage;

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>{t('cart_title')}</Text>
      <Text style={headerSubtitle}>{t('cart_header_subtitle').replace('{count}', String(lines.length))}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('cart_order_type')}</Text>
      <View style={segmentedWrap}>
        <Pressable style={[segmentButton, orderType === 'takeaway' && segmentButtonActive]} onPress={() => setOrderType('takeaway')}>
          <Text style={[segmentLabel, orderType === 'takeaway' && segmentLabelActive]}>{t('order_type_takeaway')}</Text>
        </Pressable>
        <Pressable style={[segmentButton, orderType === 'delivery' && segmentButtonActive]} onPress={() => setOrderType('delivery')}>
          <Text style={[segmentLabel, orderType === 'delivery' && segmentLabelActive]}>{t('order_type_delivery')}</Text>
        </Pressable>
      </View>

      {orderType === 'delivery' && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <TextInput
            placeholder={t('cart_postal_placeholder')}
            value={postalCodeInput}
            onChangeText={setPostalCodeInput}
            keyboardType="numeric"
            style={inputStyle}
          />
          {!deliveryBlockedMessage && deliveryRule && (
            <View style={successBadge}>
              <Text style={successText}>{t('cart_zone_ok').replace('{postal}', deliveryRule.postalCode).replace('{minimum}', minimumOrder.toFixed(2)).replace('{fee}', deliveryFee.toFixed(2))}</Text>
            </View>
          )}
          {!!deliveryBlockedMessage && <Text style={errorText}>{deliveryBlockedMessage}</Text>}
        </View>
      )}
    </View>

    {lines.length === 0 ? (
      <View style={sectionCard}>
        <Text style={emptyTitle}>{t('cart_empty_title')}</Text>
        <Text style={emptySubtitle}>{t('cart_empty_copy')}</Text>
      </View>
    ) : (
      <View style={{ gap: 10 }}>
        {lines.map((line) => (
          <View key={line.lineKey} style={lineCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={lineName}>{line.name}</Text>
                {line.selectedOptions.map((opt, idx) => (
                  <View key={`${line.lineKey}-${idx}`} style={modifierPill}>
                    <Text style={lineModifier}>{opt.groupName}</Text>
                    <Text style={modifierSep}>•</Text>
                    <Text style={lineModifierValue}>{opt.optionLabel}</Text>
                  </View>
                ))}
              </View>
              <Text style={lineTotal}>CHF {(line.price * line.quantity).toFixed(2)}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={unitPrice}>{`CHF ${line.price.toFixed(2)} / ${t('cart_unit')}`}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable style={qtyButton} onPress={() => updateQty(line.lineKey, -1)}>
                  <Text style={qtyButtonText}>−</Text>
                </Pressable>
                <Text style={qtyValue}>{line.quantity}</Text>
                <Pressable style={[qtyButton, qtyButtonDark]} onPress={() => updateQty(line.lineKey, 1)}>
                  <Text style={[qtyButtonText, { color: '#fff' }]}>+</Text>
                </Pressable>
                <Pressable onPress={() => removeLine(line.lineKey)} style={removeButton}>
                  <Text style={removeLabel}>{t('cart_remove')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>
    )}

    <View style={[sectionCard, { backgroundColor: '#fcfbf9' }]}>
      <Text style={sectionTitle}>{t('cart_promo_title')}</Text>
      <TextInput
        placeholder={t('cart_promo_placeholder')}
        value={promoInput}
        onChangeText={setPromoInput}
        autoCapitalize="characters"
        style={inputStyle}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable style={secondaryAction} onPress={applyPromotion}>
          <Text style={secondaryActionLabel}>{promoLoading ? t('cart_applying') : t('cart_apply')}</Text>
        </Pressable>
        {!!appliedPromotion && (
          <Pressable style={[secondaryAction, secondaryActionDanger]} onPress={removePromotion}>
            <Text style={secondaryActionDangerLabel}>{t('cart_remove')}</Text>
          </Pressable>
        )}
      </View>
      {!!promoFeedback && <Text style={promoFeedback === t('cart_promo_applied') ? successText : infoText}>{promoFeedback}</Text>}
    </View>

    <View style={summaryCard}>
      <Text style={sectionTitle}>{t('cart_summary')}</Text>
      <Row label={t('cart_subtotal')} value={`CHF ${subtotal.toFixed(2)}`} />
      {orderType === 'delivery' && deliveryRule && <Row label={t('order_type_delivery')} value={`CHF ${deliveryFee.toFixed(2)}`} />}
      {!!appliedPromotion && <Row label={`${t('cart_discount')} (${appliedPromotion.promotionCode})`} value={`- CHF ${discountAmount.toFixed(2)}`} valueStyle={{ color: '#15803d' }} />}
      <View style={totalDivider} />
      <Row label={t('checkout_total')} value={`CHF ${finalTotal.toFixed(2)}`} labelStyle={totalLabel} valueStyle={totalValue} />
    </View>

    <Pressable
      style={[checkoutButton, !canCheckout && checkoutButtonDisabled]}
      onPress={() => navigation.navigate('Checkout', {
        orderType,
        customerPostalCode: orderType === 'delivery' ? normalizedPostalCode : undefined,
        promotionCode: appliedPromotion?.promotionCode || undefined,
        subtotalAmount: subtotal,
        discountAmount,
        deliveryFeeAmount: deliveryFee,
        totalAmount: finalTotal,
      })}
      disabled={!canCheckout}
    >
      <Text style={checkoutButtonText}>{t('cart_continue_checkout')}</Text>
    </Pressable>

    {!canCheckout && <Text style={errorText}>{lines.length === 0 ? t('cart_empty_short') : deliveryBlockedMessage}</Text>}
  </Screen>;
}

function Row({ label, value, labelStyle, valueStyle }: { label: string; value: string; labelStyle?: any; valueStyle?: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
      <Text style={[summaryLabel, labelStyle]}>{label}</Text>
      <Text style={[summaryValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const sectionTitle = { color: '#1f1a17', fontSize: 16, fontWeight: '800', marginBottom: 8 } as const;

const segmentedWrap = { flexDirection: 'row', backgroundColor: '#f3f1ee', padding: 4, borderRadius: 12, gap: 4 } as const;
const segmentButton = { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' } as const;
const segmentButtonActive = { backgroundColor: '#25201d' } as const;
const segmentLabel = { color: '#6f675f', fontWeight: '700' } as const;
const segmentLabelActive = { color: '#fff' } as const;

const lineCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const lineName = { color: '#1f1a17', fontWeight: '800', fontSize: 17 } as const;
const lineModifier = { color: '#7b746d', marginTop: 2, fontSize: 12 } as const;
const lineModifierValue = { color: '#5f5750', fontSize: 12, fontWeight: '600' } as const;
const modifierPill = { marginTop: 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#eee7e0', backgroundColor: '#faf8f5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 } as const;
const modifierSep = { color: '#a89f95', fontSize: 11 } as const;
const lineTotal = { color: '#151210', fontWeight: '900', fontSize: 17 } as const;
const unitPrice = { color: '#7b746d', fontSize: 12 } as const;

const qtyButton = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#d9d3cd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' } as const;
const qtyButtonDark = { backgroundColor: '#1f1a17', borderColor: '#1f1a17' } as const;
const qtyButtonText = { color: '#1f1a17', fontSize: 16, fontWeight: '800', lineHeight: 17 } as const;
const qtyValue = { width: 22, textAlign: 'center', color: '#1f1a17', fontSize: 15, fontWeight: '700' } as const;
const removeButton = { marginLeft: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff7ed' } as const;
const removeLabel = { color: '#7c2d12', fontWeight: '600', fontSize: 12 } as const;

const successBadge = { borderRadius: 10, backgroundColor: '#edf7f0', borderWidth: 1, borderColor: '#cae9d4', paddingHorizontal: 10, paddingVertical: 8 } as const;
const successText = { color: '#166534', fontSize: 12, fontWeight: '600', marginTop: 6 } as const;
const infoText = { color: '#6b625a', fontSize: 12, fontWeight: '500', marginTop: 6 } as const;
const errorText = { color: '#b91c1c', fontSize: 12, fontWeight: '600' } as const;

const inputStyle = { borderWidth: 1, borderColor: '#e5dfd8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fcfbf9', color: '#1f1a17' } as const;

const secondaryAction = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f8f6f3' } as const;
const secondaryActionLabel = { color: '#1f1a17', fontWeight: '700' } as const;
const secondaryActionDanger = { borderColor: '#fecaca', backgroundColor: '#fff5f5' } as const;
const secondaryActionDangerLabel = { color: '#b91c1c', fontWeight: '700' } as const;

const summaryCard = { borderWidth: 1, borderColor: '#e8e1da', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const summaryLabel = { color: '#6b625a', fontSize: 14 } as const;
const summaryValue = { color: '#1f1a17', fontSize: 14, fontWeight: '700' } as const;
const totalDivider = { height: 1, backgroundColor: '#efeae5', marginTop: 10 } as const;
const totalLabel = { color: '#1f1a17', fontSize: 17, fontWeight: '800' } as const;
const totalValue = { color: '#1f1a17', fontSize: 20, fontWeight: '900' } as const;

const checkoutButton = { borderRadius: 14, backgroundColor: '#b5122a', paddingVertical: 14, alignItems: 'center' } as const;
const checkoutButtonDisabled = { backgroundColor: '#d8d0c8', borderWidth: 1, borderColor: '#c9beb4' } as const;
const checkoutButtonText = { color: '#fff', fontWeight: '800', fontSize: 16 } as const;

const emptyTitle = { color: '#1f1a17', fontWeight: '800', fontSize: 17 } as const;
const emptySubtitle = { color: '#7b746d', marginTop: 3 } as const;
