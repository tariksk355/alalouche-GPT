import React, { useEffect, useState } from 'react';
import { Alert, Button, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { storefrontApi } from '../api/storefront';

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ReservationsScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    date: toLocalDateInputValue(),
    time: '',
    guests: 2,
    notes: '',
  });

  useEffect(() => {
    if (!session?.customer) return;
    setForm((prev) => ({
      ...prev,
      name: session.customer?.fullName || prev.name,
      email: session.customer?.email || prev.email,
      phone: session.customer?.phone || prev.phone,
    }));
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSlots() {
      setLoadingSlots(true);
      try {
        const reservationSettings = await storefrontApi.getReservationSettings();
        const remoteSlots = reservationSettings.timeSlots || reservationSettings.slots || [];
        if (!cancelled) {
          setSlots(Array.isArray(remoteSlots) ? remoteSlots.filter((slot) => typeof slot === 'string') : []);
        }
      } catch {
        if (!cancelled) {
          setSlots([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    }

    bootstrapSlots();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (form.time && !slots.includes(form.time)) {
      setForm((prev) => ({ ...prev, time: '' }));
    }
  }, [slots, form.time]);

  const submit = async () => {
    if (!form.name || !form.email || !form.phone || !form.date || !form.time) {
      Alert.alert('Champs requis', 'Veuillez compléter les champs obligatoires.');
      return;
    }

    setLoading(true);
    try {
      await storefrontApi.createReservation(session?.token || null, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        date: form.date,
        time: form.time,
        guests: Number(form.guests),
        notes: form.notes || undefined,
      });

      Alert.alert('Réservation envoyée', 'Votre demande a bien été transmise.');
      setForm((prev) => ({
        ...prev,
        date: toLocalDateInputValue(),
        time: '',
        guests: 2,
        notes: '',
      }));
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "La réservation n'a pas pu être envoyée.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>Réservation</Text>

        <Text>Nom complet *</Text>
        <TextInput value={form.name} onChangeText={(name) => setForm((prev) => ({ ...prev, name }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 }} />

        <Text>Email *</Text>
        <TextInput value={form.email} keyboardType="email-address" autoCapitalize="none" onChangeText={(email) => setForm((prev) => ({ ...prev, email }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 }} />

        <Text>Téléphone *</Text>
        <TextInput value={form.phone} onChangeText={(phone) => setForm((prev) => ({ ...prev, phone }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 }} />

        <Text>Date (YYYY-MM-DD) *</Text>
        <TextInput value={form.date} onChangeText={(date) => setForm((prev) => ({ ...prev, date }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 }} />

        <Text>Heure *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {slots.map((slot) => {
            const selected = form.time === slot;
            return (
              <Text
                key={slot}
                onPress={() => setForm((prev) => ({ ...prev, time: slot }))}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? '#111' : '#bbb',
                  backgroundColor: selected ? '#111' : '#fff',
                  color: selected ? '#fff' : '#111',
                  borderRadius: 16,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                {slot}
              </Text>
            );
          })}
          {!loadingSlots && slots.length === 0 && <Text>Aucun créneau disponible.</Text>}
          {loadingSlots && <Text>Chargement des créneaux…</Text>}
        </View>

        <Text>Nombre de personnes *</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button title="-" onPress={() => setForm((prev) => ({ ...prev, guests: Math.max(1, prev.guests - 1) }))} />
          <Text>{form.guests}</Text>
          <Button title="+" onPress={() => setForm((prev) => ({ ...prev, guests: Math.min(20, prev.guests + 1) }))} />
        </View>

        <Text>Notes (optionnel)</Text>
        <TextInput
          value={form.notes}
          onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
          multiline
          numberOfLines={3}
          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' }}
        />

        <Button title={loading ? 'Envoi...' : 'Confirmer la réservation'} disabled={loading} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}
