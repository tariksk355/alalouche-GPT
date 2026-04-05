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
const ORDER_STATUS_MAP = {
  accepted: 'accepted',
  ready: 'ready',
  completed: 'completed',
};
const ORDER_STATUS_LABELS = {
  new: 'Nouveau',
  accepted: 'Acceptée',
  ready: 'Prête',
  completed: 'Terminée',
  cancelled: 'Annulée',
};
const RESERVATION_STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  cancelled: 'Annulée',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('fr-CH', { timeZone: 'Europe/Zurich' });
}

function extractOrderPayload(order) {
  return order?.payload && typeof order.payload === 'object' ? order.payload : {};
}

function textOrDash(value) {
  if (typeof value !== 'string') return '—';
  const trimmed = value.trim();
  return trimmed || '—';
}

function compactText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function previewText(value, max = 90) {
  const text = compactText(value);
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function formatOrderType(value) {
  const normalized = compactText(value).toLowerCase();
  if (normalized === 'delivery') return 'Livraison';
  if (normalized === 'takeaway' || normalized === 'pickup') return 'À emporter';
  return textOrDash(value);
}

function formatOrderStatus(value) {
  const normalized = compactText(value).toLowerCase();
  return ORDER_STATUS_LABELS[normalized] || textOrDash(value);
}

function formatReservationStatus(value) {
  const normalized = compactText(value).toLowerCase();
  return RESERVATION_STATUS_LABELS[normalized] || textOrDash(value);
}

function renderItemOptionLabel(option) {
  if (!option || typeof option !== 'object') return '';
  const label = compactText(option.optionLabel);
  const group = compactText(option.groupName);
  if (group && label) return `${group}: ${label}`;
  return label || group;
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
    const normalizedStatus = ORDER_STATUS_MAP[String(status || '').trim().toLowerCase()];
    if (!normalizedStatus) {
      Alert.alert('Erreur', 'Statut de commande invalide.');
      return;
    }
    setActionInFlight(true);
    try {
      const payload = normalizedStatus === 'accepted'
        ? { status: normalizedStatus, prepMinutes: selectedPrep }
        : { status: normalizedStatus };
      await updateOrderStatus(session.token, selectedOrder.id, payload);
      await refreshData();
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
  const orderItems = Array.isArray(orderPayload.items) ? orderPayload.items : [];
  const orderNotesRaw = typeof (selectedOrder?.notes || orderPayload?.notes) === 'string'
    ? (selectedOrder?.notes || orderPayload?.notes)
    : '';
  const orderNoteLines = orderNotesRaw.length ? orderNotesRaw.split('\n') : [];

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
              <Text style={styles.detailPrimary}>Statut: {formatOrderStatus(selectedOrder.status)}</Text>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Client:</Text>
                <Text style={styles.semanticValue}>{selectedOrder.customerName || '—'}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Type de commande:</Text>
                <Text style={styles.semanticValue}>{formatOrderType(selectedOrder.orderType || orderPayload.orderType)}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Téléphone:</Text>
                <Text style={styles.semanticValue}>{textOrDash(selectedOrder.customerPhone || orderPayload.customerPhone)}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Adresse:</Text>
                <Text style={styles.semanticValue}>{textOrDash(selectedOrder.customerAddress || orderPayload.customerAddress)}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Paiement:</Text>
                <Text style={styles.semanticValue}>{textOrDash(selectedOrder.paymentMethod || orderPayload.paymentMethod)}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Commande:</Text>
                <Text style={styles.semanticValue}>{formatDate(selectedOrder.createdAt)}</Text>
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Commandes total:</Text>
                <Text style={styles.semanticValue}>{Number.isFinite(Number(selectedOrder.customerTotalOrderCount)) ? `${Number(selectedOrder.customerTotalOrderCount)} commande(s)` : '—'}</Text>
              </View>
              {Number.isFinite(Number(selectedOrder.prepMinutes || orderPayload.prepMinutes)) ? (
                <View style={styles.semanticBlock}>
                  <Text style={styles.semanticLabel}>Durée de préparation:</Text>
                  <Text style={styles.semanticValue}>{Number(selectedOrder.prepMinutes || orderPayload.prepMinutes)} min</Text>
                </View>
              ) : null}
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabel}>Commentaire:</Text>
                {orderNoteLines.length ? orderNoteLines.map((line, index) => (
                  <Text key={`comment-line-${index}`} style={styles.semanticValue}>{line || ' '}</Text>
                )) : <Text style={styles.semanticValue}>—</Text>}
              </View>
              <View style={styles.semanticBlock}>
                <Text style={styles.semanticLabelTotal}>TOTAL:</Text>
                <Text style={styles.semanticValueTotal}>CHF {Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Articles</Text>
              {orderItems.length === 0 ? (
                <Text style={styles.detailItem}>Aucun article détaillé.</Text>
              ) : orderItems.map((item, index) => {
                const quantity = Number(item?.quantity || 1);
                const name = textOrDash(item?.name);
                const linePrice = Number(item?.price || 0);
                const selectedOptions = Array.isArray(item?.selectedOptions) ? item.selectedOptions : [];
                return (
                  <View key={`${name}-${index}`} style={styles.orderItemBlock}>
                    <Text style={styles.orderItemTitle}>{quantity} × {name}</Text>
                    <Text style={styles.orderItemPrice}>CHF {linePrice.toFixed(2)}</Text>
                    {selectedOptions.length > 0 ? selectedOptions.map((option, optionIndex) => {
                      const optionLabel = renderItemOptionLabel(option);
                      if (!optionLabel) return null;
                      return (
                        <Text key={`${name}-${index}-opt-${optionIndex}`} style={styles.orderItemOption}>
                          • {optionLabel}
                        </Text>
                      );
                    }) : null}
                  </View>
                );
              })}
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
                    <Text style={styles.primaryButtonLabel}>{formatOrderStatus(status)}</Text>
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
                    <Text style={styles.statusBadgeLabel}>{formatOrderStatus(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{formatOrderType(item.orderType || extractOrderPayload(item).orderType)}</Text>
                <Text style={styles.cardPrimary}>{item.customerName || 'Client inconnu'}</Text>
                <Text style={styles.cardSecondary}>{textOrDash(item.customerPhone || extractOrderPayload(item).customerPhone)}</Text>
                <Text style={styles.cardSecondaryStrong}>CHF {Number(item.totalAmount || 0).toFixed(2)}</Text>
                {compactText(item.customerAddress || extractOrderPayload(item).customerAddress)
                  && String(item.orderType || extractOrderPayload(item).orderType || '').toLowerCase() === 'delivery' ? (
                    <Text style={styles.cardSecondary}>Livraison: {previewText(item.customerAddress || extractOrderPayload(item).customerAddress, 72)}</Text>
                  ) : null}
                {compactText(item.notes || extractOrderPayload(item).notes) ? (
                  <Text style={styles.cardSecondary}>Note: {previewText(item.notes || extractOrderPayload(item).notes, 72)}</Text>
                ) : null}
                {Number.isFinite(Number(item.customerTotalOrderCount)) ? (
                  <Text style={styles.cardSecondary}>Historique client: {Number(item.customerTotalOrderCount)} commande(s)</Text>
                ) : null}
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
            <Text style={styles.detailPrimary}>Statut: {formatReservationStatus(selectedReservation.status)}</Text>
            <Text style={styles.detailItem}>Nom: {selectedReservation.customerName || '—'}</Text>
            <Text style={styles.detailItem}>Email: {selectedReservation.customerEmail || '—'}</Text>
            <Text style={styles.detailItem}>Téléphone: {selectedReservation.customerPhone || '—'}</Text>
            <Text style={styles.detailItem}>Couverts: {selectedReservation.guestCount ?? '—'}</Text>
            <Text style={styles.detailItem}>Date: {formatDate(selectedReservation.reservationDate)}</Text>
            <Text style={styles.detailItem}>Notes: {textOrDash(selectedReservation.notes)}</Text>
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
                  <Text style={styles.primaryButtonLabel}>{formatReservationStatus(status)}</Text>
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
                  <Text style={styles.statusBadgeLabel}>{formatReservationStatus(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.cardPrimary}>{item.guestCount} couvert(s)</Text>
              <Text style={styles.cardSecondary}>{textOrDash(item.customerPhone)}</Text>
              {compactText(item.notes) ? <Text style={styles.cardSecondary}>Note: {compactText(item.notes)}</Text> : null}
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
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fff', minHeight: 150, justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700', marginBottom: 6, color: '#111827', fontSize: 16, flex: 1 },
  statusBadge: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeLabel: { color: '#374151', fontSize: 12, fontWeight: '700' },
  cardPrimary: { color: '#111827', fontSize: 15, marginBottom: 2 },
  cardMeta: { color: '#6b7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  cardSecondaryStrong: { color: '#111827', fontSize: 14, fontWeight: '700', marginTop: 2 },
  cardSecondary: { color: '#6b7280', fontSize: 13 },
  detailContainer: { flex: 1, paddingBottom: 10 },
  sectionCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, backgroundColor: '#fff', marginBottom: 10 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  detailPrimary: { color: '#111827', fontWeight: '700', marginBottom: 6, fontSize: 15 },
  detailItem: { color: '#374151', marginBottom: 4, fontSize: 14 },
  detailAmount: { color: '#111827', fontWeight: '700', marginTop: 4, fontSize: 15 },
  semanticBlock: { marginBottom: 8 },
  semanticLabel: { color: '#111827', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  semanticValue: { color: '#374151', fontSize: 14, lineHeight: 20 },
  semanticLabelTotal: { color: '#111827', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  semanticValueTotal: { color: '#111827', fontSize: 16, fontWeight: '800' },
  orderItemBlock: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  orderItemTitle: { color: '#111827', fontWeight: '700', fontSize: 14 },
  orderItemPrice: { color: '#374151', fontSize: 13, marginTop: 2 },
  orderItemOption: { color: '#4b5563', fontSize: 13, marginTop: 2 },
  sectionTitle: { fontWeight: '700', color: '#111827', marginBottom: 8, fontSize: 15 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, minHeight: 42, justifyContent: 'center' },
  pillActive: { borderColor: '#b5122a', backgroundColor: '#fef2f2' },
  pillLabel: { color: '#111827' },
  pillLabelActive: { color: '#b5122a', fontWeight: '700' },
  actionRow: { marginTop: 8, gap: 6, paddingBottom: 20 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 24, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 12 },
});
