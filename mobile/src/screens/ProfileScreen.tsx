import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { BrandButton } from '../components/BrandButton';
import { CustomerProfile } from '../api/auth';
import { useLanguage } from '../contexts/LanguageContext';

type ProfileFormState = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  deliveryInstructions: string;
};

const PRIVACY_POLICY_URL = 'https://www.alalouche.ch/politique-de-confidentialite';

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
  const { session, logout, updateProfile, deleteAccount } = useAuth();
  const { t } = useLanguage();
  const customer = session?.customer;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
      setFeedback({ type: 'success', message: t('profile_updated') });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || t('profile_update_error') });
    } finally {
      setSaving(false);
    }
  };

  const onDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
    } catch (err: any) {
      setDeleteError(err?.message || t('profile_delete_error'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (deleting) return;
    setDeleteError('');
    Alert.alert(
      t('profile_delete_title'),
      t('profile_delete_confirm'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_delete_confirm_cta'),
          style: 'destructive',
          onPress: onDeleteAccount,
        },
      ],
    );
  };

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir la politique de confidentialité.");
    }
  };

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>{t('profile_title')}</Text>
      <Text style={headerSubtitle}>{t('profile_subtitle')}</Text>
    </View>

    {isSignedIn ? (
      <>
        <View style={sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={avatarBubble}>
              <Text style={avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={welcomeTitle}>{`${t('profile_hello')} ${customerData.fullName || t('profile_hello_fallback')} 👋`}</Text>
              <Text style={helperText}>{t('profile_connected')}</Text>
            </View>
          </View>

          {!editing ? (
            <>
              <View style={infoRow}>
                <Text style={label}>{t('common_full_name')}</Text>
                <Text style={value}>{customerData.fullName || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>{t('common_email')}</Text>
                <Text style={value}>{customerData.email || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>{t('common_phone')}</Text>
                <Text style={value}>{customerData.phone || '-'}</Text>
              </View>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>{t('profile_delivery_address')}</Text>
                <Text style={value}>{profileSummary || t('profile_not_set')}</Text>
              </View>
              {!!customerData.deliveryInstructions && (
                <>
                  <View style={divider} />
                  <View style={infoRow}>
                    <Text style={label}>{t('profile_instructions')}</Text>
                    <Text style={value}>{customerData.deliveryInstructions}</Text>
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={inputGroup}>
                <Text style={label}>{t('common_full_name')}</Text>
                <TextInput style={input} value={form.fullName} onChangeText={(v) => setForm((prev) => ({ ...prev, fullName: v }))} placeholder={t('common_full_name')} />
              </View>
              <View style={inputGroup}>
                <Text style={label}>{t('profile_email_readonly')}</Text>
                <Text style={readOnlyValue}>{customerData.email || '-'}</Text>
              </View>
              <View style={inputGroup}>
                <Text style={label}>{t('common_phone')}</Text>
                <TextInput style={input} value={form.phone} onChangeText={(v) => setForm((prev) => ({ ...prev, phone: v }))} placeholder={t('common_phone')} keyboardType="phone-pad" />
              </View>
              <View style={inputGroup}>
                <Text style={label}>{t('profile_address_line1')}</Text>
                <TextInput style={input} value={form.addressLine1} onChangeText={(v) => setForm((prev) => ({ ...prev, addressLine1: v }))} placeholder={t('profile_address_line1')} />
              </View>
              <View style={inputGroup}>
                <Text style={label}>{t('profile_address_line2')}</Text>
                <TextInput style={input} value={form.addressLine2} onChangeText={(v) => setForm((prev) => ({ ...prev, addressLine2: v }))} placeholder={t('profile_address_line2_optional')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[inputGroup, { flex: 1 }]}>
                  <Text style={label}>{t('checkout_postal_code')}</Text>
                  <TextInput style={input} value={form.postalCode} onChangeText={(v) => setForm((prev) => ({ ...prev, postalCode: v }))} placeholder="Code postal" />
                </View>
                <View style={[inputGroup, { flex: 1 }]}>
                  <Text style={label}>{t('profile_city')}</Text>
                  <TextInput style={input} value={form.city} onChangeText={(v) => setForm((prev) => ({ ...prev, city: v }))} placeholder={t('profile_city')} />
                </View>
              </View>
              <View style={inputGroup}>
                <Text style={label}>{t('profile_delivery_instructions')}</Text>
                <TextInput
                  style={[input, { minHeight: 74, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={form.deliveryInstructions}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, deliveryInstructions: v }))}
                  placeholder={t('profile_delivery_instructions_placeholder')}
                  multiline
                />
              </View>
            </View>
          )}

          {!!customerData.id && (
            <>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>{t('profile_account')}</Text>
                <Text style={value}>#{customerData.id.slice(0, 8).toUpperCase()}</Text>
              </View>
            </>
          )}
        </View>

        <View style={sectionCard}>
          {saving && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ActivityIndicator size="small" color="#4f463f" />
              <Text style={helperText}>{t('profile_updating')}</Text>
            </View>
          )}
          {!saving && feedback && (
            <View style={[notice, feedback.type === 'success' ? successNotice : errorNotice]}>
              <Text style={feedback.type === 'success' ? successText : errorText}>{feedback.message}</Text>
            </View>
          )}
          {!editing ? (
            <BrandButton label={t('profile_edit')} onPress={() => { setFeedback(null); setForm(buildFormState(customer)); setEditing(true); }} />
          ) : (
            <View style={{ gap: 8 }}>
              <BrandButton label={saving ? t('profile_saving') : t('profile_save')} disabled={disableSave} onPress={onSave} />
              <Pressable style={secondaryButton} onPress={() => { setEditing(false); setFeedback(null); setForm(buildFormState(customer)); }}>
                <Text style={secondaryButtonLabel}>{t('common_cancel')}</Text>
              </Pressable>
            </View>
          )}
          <Text style={helperText}>{t('profile_logout_hint')}</Text>
          <BrandButton label={t('profile_logout')} onPress={() => logout()} />
        </View>

        <View style={dangerCard}>
          <Text style={dangerTitle}>{t('profile_delete_title')}</Text>
          <Text style={dangerText}>
            {t('profile_delete_copy')}
          </Text>
          {!!deleteError && (
            <View style={[notice, errorNotice, { marginTop: 8 }]}>
              <Text style={errorText}>{deleteError}</Text>
            </View>
          )}
          <Pressable style={[dangerButton, deleting && { opacity: 0.6 }]} onPress={confirmDeleteAccount} disabled={deleting}>
            <Text style={dangerButtonLabel}>{deleting ? t('profile_deleting') : t('profile_delete_cta')}</Text>
          </Pressable>
        </View>
      </>
    ) : (
      <View style={sectionCard}>
        <Text style={welcomeTitle}>{t('common_welcome')}</Text>
        <Text style={helperText}>{t('profile_guest_copy')}</Text>

        <View style={{ gap: 8 }}>
          <BrandButton label={t('login_cta')} onPress={() => navigation.navigate('Login')} />
          <Pressable style={secondaryButton} onPress={() => navigation.navigate('Signup')}>
            <Text style={secondaryButtonLabel}>{t('login_create_account')}</Text>
          </Pressable>
        </View>
      </View>
    )}

    <View style={sectionCard}>
      <Text style={sectionTitle}>Légal</Text>
      <Pressable style={secondaryButton} onPress={openPrivacyPolicy}>
        <Text style={secondaryButtonLabel}>Politique de confidentialité</Text>
      </Pressable>
    </View>
  </Screen>;
}

const headerCard = { borderWidth: 1, borderColor: '#ebe7e3', borderRadius: 18, backgroundColor: '#f8f6f3', padding: 16 } as const;
const headerTitle = { color: '#1f1a17', fontSize: 31, fontWeight: '800', letterSpacing: -0.4 } as const;
const headerSubtitle = { color: '#6f675f', marginTop: 4, fontSize: 14 } as const;

const sectionCard = { borderWidth: 1, borderColor: '#ece7e2', borderRadius: 16, backgroundColor: '#fff', padding: 12 } as const;
const sectionTitle = { color: '#1f1a17', fontSize: 16, fontWeight: '800', marginBottom: 8 } as const;

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
const dangerCard = { borderWidth: 1, borderColor: '#f1cdcd', borderRadius: 16, backgroundColor: '#fff7f7', padding: 12 } as const;
const dangerTitle = { color: '#8f1f1f', fontSize: 16, fontWeight: '800' } as const;
const dangerText = { color: '#7a5a5a', marginTop: 4, lineHeight: 19 } as const;
const dangerButton = { borderWidth: 1, borderColor: '#d35656', backgroundColor: '#b53030', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 } as const;
const dangerButtonLabel = { color: '#fff', fontWeight: '800' } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
