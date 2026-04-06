import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useCart } from '../contexts/CartContext';
import { storefrontApi } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';

export function CheckoutScreen({ navigation, route }: any) {
  const { lines, clear } = useCart();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const orderType = route?.params?.orderType === 'delivery' ? 'delivery' : 'takeaway';
  const customerPostalCode = route?.params?.customerPostalCode;
  const promotionCode = route?.params?.promotionCode;

  const totalItems = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const totalAmount = Number(route?.params?.totalAmount || 0);

  return <Screen>
    <View style={headerCard}>
      <Pressable onPress={() => navigation.goBack()} style={backPill}>
        <Text style={backPillLabel}>← Retour au panier</Text>
      </Pressable>
      <Text style={headerTitle}>Checkout</Text>
      <Text style={headerSubtitle}>Finalisez votre commande en quelques secondes</Text>
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>Vos informations</Text>
      <Text style={fieldLabel}>Nom</Text>
      <TextInput placeholder="Votre nom" placeholderTextColor="#8b837b" value={name} onChangeText={setName} style={inputStyle} />
      <Text style={fieldLabel}>Téléphone</Text>
      <TextInput placeholder="Votre numéro" placeholderTextColor="#8b837b" value={phone} onChangeText={setPhone} style={inputStyle} keyboardType="phone-pad" />
      {orderType === 'delivery' && (
        <>
        <Text style={fieldLabel}>Adresse de livraison</Text>
        <TextInput
          placeholder="Rue, numéro, ville"
          placeholderTextColor="#8b837b"
          value={address}
          onChangeText={setAddress}
          style={inputStyle}
        />
        </>
      )}
    </View>

    <View style={sectionCard}>
      <Text style={sectionTitle}>Détails commande</Text>
      <Row label="Type" value={orderType === 'delivery' ? 'Livraison' : 'À emporter'} />
      {orderType === 'delivery' && <Row label="Code postal" value={customerPostalCode || '—'} />}
      <Row label="Articles" value={`${totalItems}`} />
      {!!promotionCode && <Row label="Promo" value={promotionCode} valueStyle={{ color: '#166534', fontWeight: '800' }} />}
      <View style={totalDivider} />
      <Row label="Total" value={`CHF ${totalAmount.toFixed(2)}`} labelStyle={totalLabel} valueStyle={totalValue} />
    </View>

    <Pressable
      style={[checkoutButton, (!name || !phone || (orderType === 'delivery' && !address)) && checkoutButtonDisabled]}
      disabled={!name || !phone || (orderType === 'delivery' && !address)}
      onPress={async () => {
        const payload = {
          customerName: name,
          customerPhone: phone,
          orderType,
          paymentMethod: 'cash',
          customerAddress: orderType === 'delivery' ? address : undefined,
          customerPostalCode: orderType === 'delivery' ? customerPostalCode : undefined,
          promotionCode: promotionCode || undefined,
          ...storefrontApi.buildOrderPayload(lines),
        };
        await storefrontApi.createOrder(session?.token || null, payload);
        clear();
        navigation.navigate('Orders');
      }}
    >
      <Text style={checkoutButtonText}>Commander maintenant</Text>
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

const checkoutButton = { borderRadius: 14, backgroundColor: '#b5122a', paddingVertical: 14, alignItems: 'center' } as const;
const checkoutButtonDisabled = { backgroundColor: '#d8d0c8', borderWidth: 1, borderColor: '#c9beb4' } as const;
const checkoutButtonText = { color: '#fff', fontWeight: '800', fontSize: 16 } as const;
