import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
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

  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Checkout</Text>
    <TextInput placeholder="Nom" value={name} onChangeText={setName} style={inputStyle} />
    <TextInput placeholder="Téléphone" value={phone} onChangeText={setPhone} style={inputStyle} />
    <Text style={{ color: '#6b7280' }}>Mode: {orderType === 'delivery' ? 'Livraison' : 'À emporter'}</Text>
    {orderType === 'delivery' && <TextInput placeholder="Adresse de livraison" value={address} onChangeText={setAddress} style={inputStyle} />}

    <BrandButton label="Commander" disabled={!name || !phone || (orderType === 'delivery' && !address)} onPress={async () => {
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
    }} />
  </Screen>;
}
const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
