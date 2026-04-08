import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useCart } from '../contexts/CartContext';
import { storefrontApi } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function CheckoutScreen({ navigation, route }: any) {
  const { lines, clear } = useCart();
  const { session } = useAuth();
  const { t } = useLanguage();
  const customer = session?.customer;
  const initialAddress = [customer?.addressLine1, customer?.addressLine2, customer?.postalCode, customer?.city].filter(Boolean).join(', ');
  const [name, setName] = useState(customer?.fullName || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(initialAddress);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orderType = route?.params?.orderType === 'delivery' ? 'delivery' : 'takeaway';
  const customerPostalCode = route?.params?.customerPostalCode;
  const promotionCode = route?.params?.promotionCode;

  const totalItems = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const totalAmount = Number(route?.params?.totalAmount || 0);

  useEffect(() => {
    if (!customer) return;
    setName((prev) => prev || customer.fullName || '');
    setPhone((prev) => prev || customer.phone || '');
    setAddress((prev) => prev || [customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city].filter(Boolean).join(', '));
  }, [customer?.fullName, customer?.phone, customer?.addressLine1, customer?.addressLine2, customer?.postalCode, customer?.city]);

  return <Screen>
    <View style={headerCard}>
      <Pressable onPress={() => navigation.goBack()} style={backPill}>
        <Text style={backPillLabel}>{`← ${t('checkout_back_to_cart')}`}</Text>
      </Pressable>
      <Text style={headerTitle}>{t('checkout_title')}</Text>
      <Text style={headerSubtitle}>{t('checkout_subtitle')}</Text>
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('checkout_info_title')}</Text>
      <Text style={fieldLabel}>{t('common_full_name')}</Text>
      <TextInput placeholder={t('signup_name_placeholder')} placeholderTextColor="#8b837b" value={name} onChangeText={setName} style={inputStyle} />
      <Text style={fieldLabel}>{t('common_phone')}</Text>
      <TextInput placeholder={t('signup_phone_placeholder')} placeholderTextColor="#8b837b" value={phone} onChangeText={setPhone} style={inputStyle} keyboardType="phone-pad" />
      {orderType === 'delivery' && (
        <>
        <Text style={fieldLabel}>{t('checkout_delivery_address')}</Text>
        <TextInput
          placeholder={t('checkout_delivery_address_placeholder')}
          placeholderTextColor="#8b837b"
          value={address}
          onChangeText={setAddress}
          style={inputStyle}
        />
        </>
      )}
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>{t('checkout_order_details')}</Text>
      <Row label={t('checkout_type')} value={orderType === 'delivery' ? t('order_type_delivery') : t('order_type_takeaway')} />
      {orderType === 'delivery' && <Row label={t('checkout_postal_code')} value={customerPostalCode || '—'} />}
      <Row label={t('checkout_items')} value={`${totalItems}`} />
      {!!promotionCode && <Row label={t('checkout_promo')} value={promotionCode} valueStyle={{ color: '#166534', fontWeight: '800' }} />}
      <View style={totalDivider} />
      <Row label={t('checkout_total')} value={`CHF ${totalAmount.toFixed(2)}`} labelStyle={totalLabel} valueStyle={totalValue} />
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>Paiement</Text>
      <View style={segmentedWrap}>
        <Pressable style={[segmentButton, paymentMethod === 'cash' && segmentButtonActive]} onPress={() => setPaymentMethod('cash')}>
          <Text style={[segmentLabel, paymentMethod === 'cash' && segmentLabelActive]}>Espèces</Text>
        </Pressable>
        <Pressable style={[segmentButton, paymentMethod === 'card' && segmentButtonActive]} onPress={() => setPaymentMethod('card')}>
          <Text style={[segmentLabel, paymentMethod === 'card' && segmentLabelActive]}>Carte</Text>
        </Pressable>
      </View>
    </View>

    <Pressable
      style={[checkoutButton, (!name || !phone || (orderType === 'delivery' && !address) || isSubmitting) && checkoutButtonDisabled]}
      disabled={!name || !phone || (orderType === 'delivery' && !address) || isSubmitting}
      onPress={async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
          const payload = {
            customerName: name,
            customerPhone: phone,
            orderType,
            paymentMethod,
            customerAddress: orderType === 'delivery' ? address : undefined,
            customerPostalCode: orderType === 'delivery' ? customerPostalCode : undefined,
            promotionCode: promotionCode || undefined,
            ...storefrontApi.buildOrderPayload(lines),
          };
          await storefrontApi.createOrder(session?.token || null, payload);
          clear();
          navigation.navigate('Orders');
        } catch (error) {
          Alert.alert('Commande impossible', 'Une erreur est survenue. Veuillez réessayer.');
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <Text style={checkoutButtonText}>{isSubmitting ? 'Envoi…' : t('checkout_submit')}</Text>
    </Pressable>
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
const backPill = { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e1dad3', backgroundColor: '#f3efea', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 } as const;
const backPillLabel = { color: '#5f5750', fontWeight: '700', fontSize: 12 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const sectionTitle = { color: '#1f1a17', fontSize: 16, fontWeight: '800', marginBottom: 8 } as const;
const fieldLabel = { color: '#6f675f', fontSize: 12, fontWeight: '700', marginTop: 8 } as const;
const inputStyle = { borderWidth: 1, borderColor: '#e5dfd8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fcfbf9', color: '#1f1a17', marginTop: 6 } as const;

const summaryLabel = { color: '#6b625a', fontSize: 14 } as const;
const summaryValue = { color: '#1f1a17', fontSize: 14, fontWeight: '700' } as const;
const totalDivider = { height: 1, backgroundColor: '#efeae5', marginTop: 10 } as const;
const totalLabel = { color: '#1f1a17', fontSize: 17, fontWeight: '800' } as const;
const totalValue = { color: '#1f1a17', fontSize: 20, fontWeight: '900' } as const;
const segmentedWrap = { flexDirection: 'row', backgroundColor: '#f3f1ee', padding: 4, borderRadius: 12, gap: 4 } as const;
const segmentButton = { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' } as const;
const segmentButtonActive = { backgroundColor: '#25201d' } as const;
const segmentLabel = { color: '#6f675f', fontWeight: '700' } as const;
const segmentLabelActive = { color: '#fff' } as const;

const checkoutButton = { borderRadius: 14, backgroundColor: '#1f1a17', paddingVertical: 14, alignItems: 'center' } as const;
const checkoutButtonDisabled = { backgroundColor: '#d8d0c8', borderWidth: 1, borderColor: '#c9beb4' } as const;
const checkoutButtonText = { color: '#fff', fontWeight: '800', fontSize: 16 } as const;
