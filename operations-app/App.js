import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
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
const POLL_MS = 5000;

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
  const [passwordVisible, setPasswordVisible] = useState(false);

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
      <SafeAreaView style={styles.loginScreen}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.loginKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <View style={styles.loginCard}>
              <Text style={styles.loginTitle}>À la Louche Ops</Text>
              <Text style={styles.loginSubtitle}>Connexion opérateur</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nom d'utilisateur</Text>
                <TextInput
                  style={styles.input}
                  placeholder="admin"
                  autoCapitalize="none"
                  value={loginForm.username}
                  onChangeText={(username) => setLoginForm((prev) => ({ ...prev, username }))}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mot de passe</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="••••••••"
                    secureTextEntry={!passwordVisible}
                    value={loginForm.password}
                    onChangeText={(password) => setLoginForm((prev) => ({ ...prev, password }))}
                  />
                  <Pressable onPress={() => setPasswordVisible((prev) => !prev)} style={styles.passwordToggle}>
                    <Text style={styles.passwordToggleLabel}>{passwordVisible ? 'Masquer' : 'Afficher'}</Text>
                  </Pressable>
                </View>
              </View>

              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

              <Pressable style={styles.loginButton} disabled={loggingIn} onPress={handleLogin}>
                <Text style={styles.loginButtonLabel}>{loggingIn ? 'Connexion...' : 'Se connecter'}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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

      {loadingData ? (
        <View style={styles.infoBanner}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.infoBannerLabel}>Actualisation...</Text>
        </View>
      ) : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {tab === 'orders' ? (
        selectedOrder ? (
          <ScrollView style={styles.detailContainer}>
            <Pressable onPress={() => setSelectedOrderId(null)}>
              <Text style={styles.link}>← Retour</Text>
            </Pressable>

            <View style={styles.sectionCard}>
              <Text style={styles.detailTitle}>Commande #{selectedOrder.orderNumber}</Text>
              <Text style={styles.detailPrimary}>Statut: {selectedOrder.status}</Text>
              <Text style={styles.detailItem}>Client: {selectedOrder.customerName || '—'}</Text>
              <Text style={styles.detailItem}>Email: {selectedOrder.customerEmail || '—'}</Text>
              <Text style={styles.detailItem}>Téléphone: {orderPayload.customerPhone || '—'}</Text>
              <Text style={styles.detailItem}>Créée le: {formatDate(selectedOrder.createdAt)}</Text>
              <Text style={styles.detailAmount}>Total: CHF {Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.sectionCard}>
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
            </View>

            <View style={styles.sectionCard}>
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
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>#{item.orderNumber}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeLabel}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.cardPrimary}>{item.customerName || 'Client inconnu'}</Text>
                <Text style={styles.cardSecondary}>{formatDate(item.createdAt)}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucune commande en cours.</Text>}
          />
        )
      ) : selectedReservation ? (
        <ScrollView style={styles.detailContainer}>
          <Pressable onPress={() => setSelectedReservationId(null)}>
            <Text style={styles.link}>← Retour</Text>
          </Pressable>
          <View style={styles.sectionCard}>
            <Text style={styles.detailTitle}>Réservation</Text>
            <Text style={styles.detailPrimary}>Statut: {selectedReservation.status}</Text>
            <Text style={styles.detailItem}>Nom: {selectedReservation.customerName || '—'}</Text>
            <Text style={styles.detailItem}>Email: {selectedReservation.customerEmail || '—'}</Text>
            <Text style={styles.detailItem}>Téléphone: {selectedReservation.customerPhone || '—'}</Text>
            <Text style={styles.detailItem}>Couverts: {selectedReservation.guestCount ?? '—'}</Text>
            <Text style={styles.detailItem}>Date: {formatDate(selectedReservation.reservationDate)}</Text>
          </View>

          <View style={styles.sectionCard}>
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
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{item.customerName || 'Réservation'}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeLabel}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.cardPrimary}>{item.guestCount} couvert(s)</Text>
              <Text style={styles.cardSecondary}>{formatDate(item.reservationDate)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune réservation en attente.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginScreen: { flex: 1, backgroundColor: '#f9fafb', padding: 20, justifyContent: 'center' },
  loginKeyboardContainer: { flex: 1, justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: '#fff', padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    backgroundColor: '#fff',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  loginTitle: { fontSize: 28, fontWeight: '700', color: '#111827' },
  loginSubtitle: { color: '#6b7280', marginBottom: 4, fontSize: 15 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  inputGroup: { gap: 6 },
  inputLabel: { color: '#374151', fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, minHeight: 50, fontSize: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, minHeight: 50 },
  passwordInput: { flex: 1, paddingHorizontal: 12, fontSize: 16 },
  passwordToggle: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 12, borderLeftWidth: 1, borderLeftColor: '#e5e7eb' },
  passwordToggleLabel: { color: '#1d4ed8', fontWeight: '600' },
  loginButton: { backgroundColor: '#b5122a', borderRadius: 10, minHeight: 52, justifyContent: 'center', marginTop: 4 },
  loginButtonLabel: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  primaryButton: { backgroundColor: '#b5122a', borderRadius: 10, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  primaryButtonLabel: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  errorText: { color: '#b91c1c', marginTop: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  link: { color: '#1d4ed8', marginVertical: 10, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 12 },
  tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabLabel: { textAlign: 'center', color: '#111827', fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  infoBannerLabel: { color: '#374151', fontWeight: '600' },
  listContent: { gap: 10, paddingBottom: 32, paddingTop: 2 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, backgroundColor: '#fff' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700', marginBottom: 6, color: '#111827', fontSize: 16, flex: 1 },
  statusBadge: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeLabel: { color: '#374151', fontSize: 12, fontWeight: '700' },
  cardPrimary: { color: '#111827', fontSize: 15, marginBottom: 2 },
  cardSecondary: { color: '#6b7280', fontSize: 13 },
  detailContainer: { flex: 1, paddingBottom: 10 },
  sectionCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, backgroundColor: '#fff', marginBottom: 10 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  detailPrimary: { color: '#111827', fontWeight: '700', marginBottom: 6, fontSize: 15 },
  detailItem: { color: '#374151', marginBottom: 4, fontSize: 14 },
  detailAmount: { color: '#111827', fontWeight: '700', marginTop: 4, fontSize: 15 },
  sectionTitle: { fontWeight: '700', color: '#111827', marginBottom: 8, fontSize: 15 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, minHeight: 42, justifyContent: 'center' },
  pillActive: { borderColor: '#b5122a', backgroundColor: '#fef2f2' },
  pillLabel: { color: '#111827' },
  pillLabelActive: { color: '#b5122a', fontWeight: '700' },
  actionRow: { marginTop: 8, gap: 6, paddingBottom: 20 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 24, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 12 },
});
