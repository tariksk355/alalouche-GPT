import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';
import { storefrontApi, getDeliveryRuleForPostalCode, normalizePostalCode, PromotionPreview } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';

export function CartScreen({ navigation }: any) {
  const { lines, updateQty, removeLine } = useCart();
  const { session } = useAuth();

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
      ? 'Veuillez saisir un code postal de livraison.'
      : !deliveryRule
        ? 'Livraison indisponible pour ce code postal.'
        : missingForMinimum > 0
          ? `Minimum CHF ${minimumOrder.toFixed(2)} pour ${normalizedPostalCode}. Il manque CHF ${missingForMinimum.toFixed(2)}.`
          : '';

  const discountedSubtotal = appliedPromotion?.totalAmount ?? subtotal;
  const discountAmount = Number(appliedPromotion?.discountAmount || 0);
  const finalTotal = discountedSubtotal + deliveryFee;

  useEffect(() => {
    if (!appliedPromotion) return;
    setAppliedPromotion(null);
    setPromoFeedback('Le panier a changé. Veuillez réappliquer votre code promo.');
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
      setPromoFeedback('Code promo appliqué.');
    } catch (error: any) {
      setAppliedPromotion(null);
      setPromoFeedback(error?.message || 'Impossible d’appliquer ce code promo.');
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromotion = () => {
    setAppliedPromotion(null);
    setPromoInput('');
    setPromoFeedback('Code promo retiré.');
  };

  const canCheckout = lines.length > 0 && !deliveryBlockedMessage;

  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Panier</Text>

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <BrandButton label="À emporter" onPress={() => setOrderType('takeaway')} />
      <BrandButton label="Livraison" onPress={() => setOrderType('delivery')} />
    </View>
    <Text style={{ color: '#6b7280', marginTop: 6 }}>Type sélectionné: {orderType === 'delivery' ? 'Livraison' : 'À emporter'}</Text>

    {orderType === 'delivery' && <View style={{ marginTop: 12, gap: 8 }}>
      <TextInput
        placeholder="Code postal (ex: 1700)"
        value={postalCodeInput}
        onChangeText={setPostalCodeInput}
        keyboardType="numeric"
        style={inputStyle}
      />
      {!deliveryBlockedMessage && deliveryRule && (
        <Text style={{ color: '#065f46' }}>
          Livraison {deliveryRule.postalCode}: min CHF {minimumOrder.toFixed(2)} · frais CHF {deliveryFee.toFixed(2)}
        </Text>
      )}
      {!!deliveryBlockedMessage && <Text style={{ color: '#b91c1c' }}>{deliveryBlockedMessage}</Text>}
    </View>}

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

    <View style={{ marginTop: 12, gap: 8 }}>
      <Text style={{ fontSize: 16 }}>Sous-total CHF {subtotal.toFixed(2)}</Text>
      {orderType === 'delivery' && deliveryRule && <Text style={{ fontSize: 16 }}>Frais de livraison CHF {deliveryFee.toFixed(2)}</Text>}

      <TextInput
        placeholder="Code promo"
        value={promoInput}
        onChangeText={setPromoInput}
        autoCapitalize="characters"
        style={inputStyle}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <BrandButton label={promoLoading ? 'Application...' : 'Appliquer promo'} onPress={applyPromotion} />
        {!!appliedPromotion && <BrandButton label="Retirer promo" onPress={removePromotion} />}
      </View>
      {!!promoFeedback && <Text style={{ color: promoFeedback.includes('appliqué') ? '#065f46' : '#6b7280' }}>{promoFeedback}</Text>}
      {!!appliedPromotion && <Text style={{ color: '#065f46' }}>Remise ({appliedPromotion.promotionCode}) - CHF {discountAmount.toFixed(2)}</Text>}

      <Text style={{ fontSize: 18, fontWeight: '700' }}>Total CHF {finalTotal.toFixed(2)}</Text>
    </View>

    <BrandButton
      label="Passer au checkout"
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
    />
    {!canCheckout && <Text style={{ color: '#b91c1c', marginTop: 8 }}>{lines.length === 0 ? 'Votre panier est vide.' : deliveryBlockedMessage}</Text>}
  </Screen>;
}

const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
