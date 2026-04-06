import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { BrandButton } from '../components/BrandButton';
import { CustomerProfile } from '../api/auth';

type ProfileFormState = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  deliveryInstructions: string;
};

function buildFormState(customer?: CustomerProfile): ProfileFormState {
  return {
    fullName: customer?.fullName || '',
    phone: customer?.phone || '',
    addressLine1: customer?.addressLine1 || '',
    addressLine2: customer?.addressLine2 || '',
    postalCode: customer?.postalCode || '',
    city: customer?.city || '',
    deliveryInstructions: customer?.deliveryInstructions || '',
  };
}

export function ProfileScreen({ navigation }: any) {
  const { session, logout, refreshProfile, updateProfile } = useAuth();
  const customer = session?.customer;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState<ProfileFormState>(() => buildFormState(customer));
  const isSignedIn = Boolean(session?.token && customer);
  const customerData = customer ?? {};
  const disableSave = saving || !form.fullName.trim();
  const initials = (customerData.fullName || customerData.email || '?').trim().slice(0, 1).toUpperCase();
  const profileSummary = useMemo(
    () => [customerData.addressLine1, customerData.addressLine2, customerData.postalCode, customerData.city].filter(Boolean).join(' · '),
    [customerData.addressLine1, customerData.addressLine2, customerData.postalCode, customerData.city],
  );

  useEffect(() => {
    setForm(buildFormState(customer));
  }, [customer?.fullName, customer?.phone, customer?.addressLine1, customer?.addressLine2, customer?.postalCode, customer?.city, customer?.deliveryInstructions]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    setRefreshingProfile(true);
    refreshProfile()
      .catch(() => {
        if (!cancelled) {
          setFeedback({ type: 'error', message: 'Impossible de charger votre profil.' });
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshProfile, session?.token]);

  const onSave = async () => {
    if (disableSave) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        postalCode: form.postalCode.trim(),
        city: form.city.trim(),
        deliveryInstructions: form.deliveryInstructions.trim(),
      });
      setEditing(false);
      setFeedback({ type: 'success', message: 'Profil mis à jour.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Mise à jour impossible.' });
    } finally {
      setSaving(false);
    }
  };

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Profil</Text>
      <Text style={headerSubtitle}>Votre espace personnel pour gérer votre compte client.</Text>
    </View>

    {isSignedIn ? (
      <>
        <View style={sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={avatarBubble}>
              <Text style={avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={welcomeTitle}>Bonjour {customerData.fullName || 'à vous'} 👋</Text>
              <Text style={helperText}>Connecté avec votre compte client.</Text>
            </View>
          </View>

          {!editing ? (
            <>
              <View style={infoRow}>
                <Text style={label}>Nom</Text>
                <Text style={value}>{customerData.fullName || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>Email</Text>
                <Text style={value}>{customerData.email || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>Téléphone</Text>
                <Text style={value}>{customerData.phone || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>Adresse de livraison</Text>
                <Text style={value}>{profileSummary || 'Non renseignée'}</Text>
              </View>
              {!!customerData.deliveryInstructions && (
                <>
                  <View style={divider} />
                  <View style={infoRow}>
                    <Text style={label}>Instructions</Text>
                    <Text style={value}>{customerData.deliveryInstructions}</Text>
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={inputGroup}>
                <Text style={label}>Nom complet</Text>
                <TextInput style={input} value={form.fullName} onChangeText={(v) => setForm((prev) => ({ ...prev, fullName: v }))} placeholder="Nom complet" />
              </View>
              <View style={inputGroup}>
                <Text style={label}>Email (lecture seule)</Text>
                <Text style={readOnlyValue}>{customerData.email || '-'}</Text>
              </View>
              <View style={inputGroup}>
                <Text style={label}>Téléphone</Text>
                <TextInput style={input} value={form.phone} onChangeText={(v) => setForm((prev) => ({ ...prev, phone: v }))} placeholder="Téléphone" keyboardType="phone-pad" />
              </View>
              <View style={inputGroup}>
                <Text style={label}>Adresse ligne 1</Text>
                <TextInput style={input} value={form.addressLine1} onChangeText={(v) => setForm((prev) => ({ ...prev, addressLine1: v }))} placeholder="Adresse ligne 1" />
              </View>
              <View style={inputGroup}>
                <Text style={label}>Adresse ligne 2</Text>
                <TextInput style={input} value={form.addressLine2} onChangeText={(v) => setForm((prev) => ({ ...prev, addressLine2: v }))} placeholder="Adresse ligne 2 (optionnel)" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[inputGroup, { flex: 1 }]}>
                  <Text style={label}>Code postal</Text>
                  <TextInput style={input} value={form.postalCode} onChangeText={(v) => setForm((prev) => ({ ...prev, postalCode: v }))} placeholder="Code postal" />
                </View>
                <View style={[inputGroup, { flex: 1 }]}>
                  <Text style={label}>Ville</Text>
                  <TextInput style={input} value={form.city} onChangeText={(v) => setForm((prev) => ({ ...prev, city: v }))} placeholder="Ville" />
                </View>
              </View>
              <View style={inputGroup}>
                <Text style={label}>Instructions de livraison</Text>
                <TextInput
                  style={[input, { minHeight: 74, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={form.deliveryInstructions}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, deliveryInstructions: v }))}
                  placeholder="Digicode, étage, précisions…"
                  multiline
                />
              </View>
            </View>
          )}

          {!!customerData.id && (
            <>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>Compte</Text>
                <Text style={value}>#{customerData.id.slice(0, 8).toUpperCase()}</Text>
              </View>
            </>
          )}
        </View>

        <View style={sectionCard}>
          {refreshingProfile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ActivityIndicator size="small" color="#4f463f" />
              <Text style={helperText}>Mise à jour du profil…</Text>
            </View>
          )}
          {feedback && (
            <View style={[notice, feedback.type === 'success' ? successNotice : errorNotice]}>
              <Text style={feedback.type === 'success' ? successText : errorText}>{feedback.message}</Text>
            </View>
          )}
          {!editing ? (
            <BrandButton label="Modifier mon profil" onPress={() => { setFeedback(null); setForm(buildFormState(customer)); setEditing(true); }} />
          ) : (
            <View style={{ gap: 8 }}>
              <BrandButton label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={disableSave} onPress={onSave} />
              <Pressable style={secondaryButton} onPress={() => { setEditing(false); setFeedback(null); setForm(buildFormState(customer)); }}>
                <Text style={secondaryButtonLabel}>Annuler</Text>
              </Pressable>
            </View>
          )}
          <Text style={helperText}>Vous êtes connecté(e). Vous pouvez vous déconnecter à tout moment.</Text>
          <BrandButton label="Se déconnecter" onPress={() => logout()} />
        </View>
      </>
    ) : (
      <View style={sectionCard}>
        <Text style={welcomeTitle}>Bienvenue</Text>
        <Text style={helperText}>Connectez-vous pour retrouver vos commandes et gérer votre profil.</Text>

        <View style={{ gap: 8 }}>
          <BrandButton label="Se connecter" onPress={() => navigation.navigate('Login')} />
          <Pressable style={secondaryButton} onPress={() => navigation.navigate('Signup')}>
            <Text style={secondaryButtonLabel}>Créer un compte</Text>
          </Pressable>
        </View>
      </View>
    )}
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;

const avatarBubble = { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3efea', borderWidth: 1, borderColor: '#e1dad3', alignItems: 'center', justifyContent: 'center' } as const;
const avatarText = { color: '#4f463f', fontWeight: '800', fontSize: 16 } as const;

const welcomeTitle = { color: '#1f1a17', fontSize: 17, fontWeight: '800' } as const;
const infoRow = { gap: 3 } as const;
const label = { color: '#7b746d', fontSize: 12, fontWeight: '700' } as const;
const value = { color: '#1f1a17', fontSize: 16, fontWeight: '700' } as const;
const readOnlyValue = { color: '#1f1a17', fontSize: 15, fontWeight: '600', backgroundColor: '#f7f3ef', borderWidth: 1, borderColor: '#e8dfd7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 } as const;
const divider = { height: 1, backgroundColor: '#efeae5', marginVertical: 10 } as const;
const helperText = { color: '#6f675f', marginBottom: 10, lineHeight: 19 } as const;
const inputGroup = { gap: 4 } as const;
const input = { borderWidth: 1, borderColor: '#e5dfd9', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: '#1f1a17' } as const;
const notice = { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 } as const;
const successNotice = { borderColor: '#cde8d2', backgroundColor: '#f1faf3' } as const;
const errorNotice = { borderColor: '#f2c7c7', backgroundColor: '#fff3f3' } as const;
const successText = { color: '#195b26', fontWeight: '600' } as const;
const errorText = { color: '#8f1f1f', fontWeight: '600' } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
