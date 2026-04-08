import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { storefrontApi } from '../api/storefront';

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value: string) {
  const parsed = fromDateInputValue(value);
  return parsed.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildDateOptions(startValue: string, count = 30) {
  const startDate = fromDateInputValue(startValue);
  return Array.from({ length: count }).map((_, index) => {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + index);
    return toLocalDateInputValue(nextDate);
  });
}


const TIMES = ['11:30', '12:00', '12:30', '13:00', '13:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];


export function ReservationsScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [slots] = useState<string[]>(TIMES);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    date: toLocalDateInputValue(),
    time: '',
    guests: 2,
    notes: '',
  });

  const dateOptions = useMemo(() => buildDateOptions(form.date), [form.date]);

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

        <Text>Date *</Text>
        <Pressable onPress={() => setShowDatePicker(true)} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 }}>
          <Text>{formatDisplayDate(form.date)}</Text>
        </Pressable>

        <Text>Heure *</Text>
        <Pressable
          onPress={() => setShowTimePicker(true)}
          disabled={slots.length === 0}
          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 }}
        >
          <Text>
            {form.time || (slots.length === 0 ? 'Aucun créneau disponible' : 'Choisir une heure')}
          </Text>
        </Pressable>

        <Text>Nombre de personnes *</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => setForm((prev) => ({ ...prev, guests: Math.max(1, prev.guests - 1) }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text>-</Text>
          </Pressable>
          <Text>{form.guests}</Text>
          <Pressable onPress={() => setForm((prev) => ({ ...prev, guests: Math.min(20, prev.guests + 1) }))} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text>+</Text>
          </Pressable>
        </View>

        <Text>Notes (optionnel)</Text>
        <TextInput
          value={form.notes}
          onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
          multiline
          numberOfLines={3}
          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' }}
        />

        <Pressable
          onPress={submit}
          disabled={loading}
          style={{
            marginTop: 8,
            backgroundColor: loading ? '#8b8178' : '#1f1a17',
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Envoi...' : 'Confirmer la réservation'}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Choisir une date</Text>
            <ScrollView>
              {dateOptions.map((option) => {
                const selected = option === form.date;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, date: option }));
                      setShowDatePicker(false);
                    }}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                  >
                    <Text style={{ fontWeight: selected ? '700' : '400' }}>{formatDisplayDate(option)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setShowDatePicker(false)} style={{ marginTop: 12, alignSelf: 'flex-end' }}>
              <Text style={{ color: '#1f1a17', fontWeight: '600' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Choisir une heure</Text>
            <ScrollView>
              {slots.map((slot) => {
                const selected = slot === form.time;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, time: slot }));
                      setShowTimePicker(false);
                    }}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                  >
                    <Text style={{ fontWeight: selected ? '700' : '400' }}>{slot}</Text>
                  </Pressable>
                );
              })}
              {slots.length === 0 && <Text style={{ color: '#6b625a' }}>Aucun créneau disponible</Text>}
            </ScrollView>
            <Pressable onPress={() => setShowTimePicker(false)} style={{ marginTop: 12, alignSelf: 'flex-end' }}>
              <Text style={{ color: '#1f1a17', fontWeight: '600' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
