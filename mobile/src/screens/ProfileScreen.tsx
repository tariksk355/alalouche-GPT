import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { BrandButton } from '../components/BrandButton';

export function ProfileScreen({ navigation }: any) {
  const { session, logout } = useAuth();
  const customer = session?.customer;
  const initials = (customer?.fullName || customer?.email || '?').trim().slice(0, 1).toUpperCase();

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Profil</Text>
      <Text style={headerSubtitle}>Votre espace personnel pour gérer votre compte client.</Text>
    </View>

    {customer ? (
      <>
        <View style={sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={avatarBubble}>
              <Text style={avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={welcomeTitle}>Bonjour {customer.fullName || 'à vous'} 👋</Text>
              <Text style={helperText}>Connecté avec votre compte client.</Text>
            </View>
          </View>

          <View style={infoRow}>
            <Text style={label}>Nom</Text>
            <Text style={value}>{customer.fullName || '-'}</Text>
          </View>

          <View style={divider} />

          <View style={infoRow}>
            <Text style={label}>Email</Text>
            <Text style={value}>{customer.email || '-'}</Text>
          </View>

          {!!customer.id && (
            <>
              <View style={divider} />
              <View style={infoRow}>
                <Text style={label}>Compte</Text>
                <Text style={value}>#{customer.id.slice(0, 8).toUpperCase()}</Text>
              </View>
            </>
          )}
        </View>

        <View style={sectionCard}>
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
const divider = { height: 1, backgroundColor: '#efeae5', marginVertical: 10 } as const;
const helperText = { color: '#6f675f', marginBottom: 10, lineHeight: 19 } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
