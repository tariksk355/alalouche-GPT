import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  listOrders,
  listReservations,
  loginAdmin,
  updateOrderStatus,
  updateReservationStatus,
} from './src/api';
import { clearSession, loadSession, saveSession } from './src/storage';

const PREP_OPTIONS = [15, 30, 45, 60];
const ORDER_ACTIONS = ['accepted', 'ready', 'completed'];
const RESERVATION_ACTIONS = ['confirmed', 'cancelled'];
const POLL_MS = 15000;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('fr-CH', { timeZone: 'Europe/Zurich' });
}

function extractOrderPayload(order) {
  return order?.payload && typeof order.payload === 'object' ? order.payload : {};
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [selectedPrep, setSelectedPrep] = useState(30);
  const [actionInFlight, setActionInFlight] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSession().then((stored) => {
      if (!mounted) return;
      setSession(stored);
      setBooting(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshData = async ({ silent = false } = {}) => {
    if (!session?.token) return;
    if (!silent) setLoadingData(true);
    setLoadError('');

    try {
      const [nextOrders, nextReservations] = await Promise.all([
        listOrders(session.token),
        listReservations(session.token),
      ]);
      setOrders(nextOrders);
      setReservations(nextReservations);
    } catch (error) {
      const code = String(error?.code || '');
      if (code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN' || code === 'AUTH_ROLE_MISMATCH' || code.startsWith('HTTP_401')) {
        await handleLogout();
        return;
      }
      setLoadError(error?.message || 'Impossible de charger les données.');
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!session?.token) return;
    refreshData();
    const id = setInterval(() => {
      refreshData({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [session?.token]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const selectedReservation = useMemo(
    () => reservations.find((reservation) => reservation.id === selectedReservationId) || null,
    [reservations, selectedReservationId],
  );

  useEffect(() => {
    if (!selectedOrder) return;
    const prep = Number(selectedOrder.prepMinutes);
    if (PREP_OPTIONS.includes(prep)) {
      setSelectedPrep(prep);
    }
  }, [selectedOrder?.id]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError('');
    try {
      const auth = await loginAdmin(loginForm.username.trim(), loginForm.password);
      await saveSession(auth);
      setSession(auth);
      setTab('orders');
      setSelectedOrderId(null);
      setSelectedReservationId(null);
      setLoginForm({ username: '', password: '' });
    } catch (error) {
      setLoginError(error?.message || 'Connexion impossible.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await clearSession();
    setSession(null);
    setOrders([]);
    setReservations([]);
    setSelectedOrderId(null);
    setSelectedReservationId(null);
    setLoadError('');
  };

  const handleOrderAction = async (status) => {
    if (!selectedOrder || actionInFlight) return;
    setActionInFlight(true);
    try {
      const payload = status === 'accepted' ? { status, prepMinutes: selectedPrep } : { status };
      await updateOrderStatus(session.token, selectedOrder.id, payload);
      await refreshData();
      Alert.alert('Succès', 'Statut commande mis à jour.');
    } catch (error) {
      Alert.alert('Erreur', error?.message || 'Impossible de mettre à jour la commande.');
    } finally {
      setActionInFlight(false);
    }
  };

  const handleReservationAction = async (status) => {
    if (!selectedReservation || actionInFlight) return;
    setActionInFlight(true);
    try {
      await updateReservationStatus(session.token, selectedReservation.id, { status });
      await refreshData();
      Alert.alert('Succès', 'Statut réservation mis à jour.');
    } catch (error) {
      Alert.alert('Erreur', error?.message || 'Impossible de mettre à jour la réservation.');
    } finally {
      setActionInFlight(false);
    }
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!session?.token) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loginCard}>
          <Text style={styles.title}>À la Louche Ops</Text>
          <Text style={styles.subtitle}>Connexion opérateur</Text>

          <TextInput
            style={styles.input}
            placeholder="Nom d'utilisateur"
            autoCapitalize="none"
            value={loginForm.username}
            onChangeText={(username) => setLoginForm((prev) => ({ ...prev, username }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            secureTextEntry
            value={loginForm.password}
            onChangeText={(password) => setLoginForm((prev) => ({ ...prev, password }))}
          />

          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

          <Pressable style={styles.primaryButton} disabled={loggingIn} onPress={handleLogin}>
            <Text style={styles.primaryButtonLabel}>{loggingIn ? 'Connexion...' : 'Se connecter'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const orderPayload = extractOrderPayload(selectedOrder);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>À la Louche Ops</Text>
        <Pressable onPress={handleLogout}>
          <Text style={styles.link}>Déconnexion</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === 'orders' && styles.tabActive]} onPress={() => setTab('orders')}>
          <Text style={[styles.tabLabel, tab === 'orders' && styles.tabLabelActive]}>Commandes</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'reservations' && styles.tabActive]} onPress={() => setTab('reservations')}>
          <Text style={[styles.tabLabel, tab === 'reservations' && styles.tabLabelActive]}>Réservations</Text>
        </Pressable>
      </View>

      {loadingData ? <ActivityIndicator style={styles.loader} /> : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {tab === 'orders' ? (
        selectedOrder ? (
          <ScrollView style={styles.detailContainer}>
            <Pressable onPress={() => setSelectedOrderId(null)}>
              <Text style={styles.link}>← Retour</Text>
            </Pressable>
            <Text style={styles.detailTitle}>Commande #{selectedOrder.orderNumber}</Text>
            <Text>Statut: {selectedOrder.status}</Text>
            <Text>Client: {selectedOrder.customerName || '—'}</Text>
            <Text>Email: {selectedOrder.customerEmail || '—'}</Text>
            <Text>Téléphone: {orderPayload.customerPhone || '—'}</Text>
            <Text>Créée le: {formatDate(selectedOrder.createdAt)}</Text>
            <Text>Total: CHF {Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>

            <Text style={styles.sectionTitle}>Temps de préparation (acceptation)</Text>
            <View style={styles.pillRow}>
              {PREP_OPTIONS.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.pill, selectedPrep === value && styles.pillActive]}
                  onPress={() => setSelectedPrep(value)}
                >
                  <Text style={[styles.pillLabel, selectedPrep === value && styles.pillLabelActive]}>{value} min</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionRow}>
              {ORDER_ACTIONS.map((status) => (
                <Pressable
                  key={status}
                  disabled={actionInFlight}
                  style={styles.primaryButton}
                  onPress={() => handleOrderAction(status)}
                >
                  <Text style={styles.primaryButtonLabel}>{status}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={loadingData}
            onRefresh={refreshData}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => setSelectedOrderId(item.id)}>
                <Text style={styles.cardTitle}>#{item.orderNumber} • {item.status}</Text>
                <Text>{item.customerName || 'Client inconnu'}</Text>
                <Text>{formatDate(item.createdAt)}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucune commande.</Text>}
          />
        )
      ) : selectedReservation ? (
        <ScrollView style={styles.detailContainer}>
          <Pressable onPress={() => setSelectedReservationId(null)}>
            <Text style={styles.link}>← Retour</Text>
          </Pressable>
          <Text style={styles.detailTitle}>Réservation</Text>
          <Text>Statut: {selectedReservation.status}</Text>
          <Text>Nom: {selectedReservation.customerName || '—'}</Text>
          <Text>Email: {selectedReservation.customerEmail || '—'}</Text>
          <Text>Téléphone: {selectedReservation.customerPhone || '—'}</Text>
          <Text>Couverts: {selectedReservation.guestCount ?? '—'}</Text>
          <Text>Date: {formatDate(selectedReservation.reservationDate)}</Text>

          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionRow}>
            {RESERVATION_ACTIONS.map((status) => (
              <Pressable
                key={status}
                disabled={actionInFlight}
                style={styles.primaryButton}
                onPress={() => handleReservationAction(status)}
              >
                <Text style={styles.primaryButtonLabel}>{status}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={loadingData}
          onRefresh={refreshData}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelectedReservationId(item.id)}>
              <Text style={styles.cardTitle}>{item.customerName || 'Réservation'} • {item.status}</Text>
              <Text>{item.guestCount} couvert(s)</Text>
              <Text>{formatDate(item.reservationDate)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune réservation.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginCard: { marginTop: 80, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6b7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 },
  primaryButton: { backgroundColor: '#b5122a', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  primaryButtonLabel: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  errorText: { color: '#b91c1c', marginTop: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  link: { color: '#1d4ed8', marginVertical: 8 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 10 },
  tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabLabel: { textAlign: 'center', color: '#111827', fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  loader: { marginVertical: 8 },
  listContent: { gap: 8, paddingBottom: 24 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 },
  cardTitle: { fontWeight: '700', marginBottom: 4, color: '#111827' },
  detailContainer: { flex: 1 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sectionTitle: { marginTop: 16, fontWeight: '700', color: '#111827' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  pillActive: { borderColor: '#b5122a', backgroundColor: '#fef2f2' },
  pillLabel: { color: '#111827' },
  pillLabelActive: { color: '#b5122a', fontWeight: '700' },
  actionRow: { marginTop: 8, gap: 6, paddingBottom: 20 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 24 },
});
