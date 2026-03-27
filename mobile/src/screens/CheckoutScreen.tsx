import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';
import { BrandButton } from '../components/BrandButton';
import { useCart } from '../contexts/CartContext';
import { storefrontApi } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';

export function CheckoutScreen({ navigation }: any) {
  const { lines, clear } = useCart();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Checkout</Text>
    <TextInput placeholder="Nom" value={name} onChangeText={setName} style={inputStyle} />
    <TextInput placeholder="Téléphone" value={phone} onChangeText={setPhone} style={inputStyle} />
    <BrandButton label="Commander" onPress={async () => {
      const payload = {
        customerName: name,
        customerPhone: phone,
        orderType: 'takeaway',
        paymentMethod: 'cash',
        ...storefrontApi.buildOrderPayload(lines),
      };
      await storefrontApi.createOrder(session?.token || null, payload);
      clear();
      navigation.navigate('Orders');
    }} />
  </Screen>;
}
const inputStyle = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 } as const;
