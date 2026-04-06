import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { storefrontApi } from '../api/storefront';
import { useAuth } from '../contexts/AuthContext';

export function OrdersScreen() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!session?.token) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setLoadError('');

    storefrontApi
      .listOrderHistory(session.token)
      .then((nextOrders) => {
        if (!mounted) return;
        setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      })
      .catch(() => {
        if (!mounted) return;
        setOrders([]);
        setLoadError('Impossible de charger votre historique pour le moment.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session?.token]);

  const statusUI = useMemo(() => ({
    new: { label: 'Reçue', bg: '#fff7e6', color: '#92400e' },
    accepted: { label: 'Acceptée', bg: '#eff6ff', color: '#1d4ed8' },
    ready: { label: 'Prête', bg: '#ecfdf5', color: '#047857' },
    completed: { label: 'Terminée', bg: '#f3f4f6', color: '#374151' },
    cancelled: { label: 'Annulée', bg: '#fef2f2', color: '#b91c1c' },
  } as Record<string, { label: string; bg: string; color: string }>), []);

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Mes commandes</Text>
      <Text style={headerSubtitle}>Suivez l’historique de vos dernières commandes.</Text>
    </View>

    {loading ? (
      <View style={stateCard}>
        <ActivityIndicator color="#b5122a" />
        <Text style={stateTitle}>Chargement de vos commandes...</Text>
      </View>
    ) : loadError ? (
      <View style={[stateCard, { borderColor: '#fecaca', backgroundColor: '#fff5f5' }]}>
        <Text style={[stateTitle, { color: '#991b1b' }]}>Oups</Text>
        <Text style={stateCopy}>{loadError}</Text>
      </View>
    ) : orders.length === 0 ? (
      <View style={stateCard}>
        <Text style={stateTitle}>Aucune commande pour l’instant</Text>
        <Text style={stateCopy}>Après votre première commande, vous la retrouverez ici.</Text>
      </View>
    ) : (
      <View style={{ gap: 10 }}>
        {orders.map((order) => {
          const key = String(order?.status || '').toLowerCase();
          const status = statusUI[key] || { label: order?.status || 'En cours', bg: '#f3f4f6', color: '#374151' };

          return (
            <View key={order.id} style={orderCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={orderNumber}>Commande #{order.orderNumber}</Text>
                  <Text style={orderMeta}>Merci pour votre confiance ✨</Text>
                </View>
                <View style={[statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[statusLabel, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              <View style={divider} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={amountLabel}>Total payé</Text>
                <Text style={amountValue}>CHF {Number(order.totalAmount || 0).toFixed(2)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    )}
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14 } as const;

const stateCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 14, alignItems: 'center', gap: 8 } as const;
const stateTitle = { color: '#1f1a17', fontWeight: '800', fontSize: 16 } as const;
const stateCopy = { color: '#6f675f', textAlign: 'center' as const };

const orderCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const orderNumber = { color: '#1f1a17', fontSize: 17, fontWeight: '800' } as const;
const orderMeta = { color: '#7b746d', fontSize: 12, marginTop: 2 } as const;

const statusBadge = { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb' } as const;
const statusLabel = { fontSize: 12, fontWeight: '700' } as const;

const divider = { height: 1, backgroundColor: '#efeae5', marginVertical: 10 } as const;
const amountLabel = { color: '#6b625a', fontSize: 13 } as const;
const amountValue = { color: '#1f1a17', fontSize: 20, fontWeight: '900' } as const;
