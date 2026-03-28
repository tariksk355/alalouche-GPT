import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { storefrontApi } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';

export function OrdersScreen() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    if (!session?.token) return;
    storefrontApi.listOrderHistory(session.token).then(setOrders).catch(() => setOrders([]));
  }, [session?.token]);

  return <Screen>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Mes commandes</Text>
    {orders.map((order) => <View key={order.id} style={{ borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10 }}>
      <Text style={{ fontWeight: '700' }}>{order.orderNumber}</Text>
      <Text>{order.status}</Text>
      <Text>CHF {Number(order.totalAmount || 0).toFixed(2)}</Text>
    </View>)}
  </Screen>;
}
