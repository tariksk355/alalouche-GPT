import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { BrandButton } from '../components/BrandButton';

export function ProfileScreen({ navigation }: any) {
  const { session, logout } = useAuth();
  const customer = session?.customer;

  return <Screen>
    <View style={headerCard}>
      <Text style={headerTitle}>Profil</Text>
      <Text style={headerSubtitle}>Gérez votre compte et vos informations client.</Text>
    </View>

    {customer ? (
      <>
        <View style={sectionCard}>
          <Text style={sectionTitle}>Informations du compte</Text>

          <View style={infoRow}>
            <Text style={label}>Nom</Text>
            <Text style={value}>{customer.fullName || '-'}</Text>
          </View>

          <View style={divider} />

          <View style={infoRow}>
            <Text style={label}>Email</Text>
            <Text style={value}>{customer.email || '-'}</Text>
          </View>
        </View>

        <View style={sectionCard}>
          <Text style={sectionTitle}>Sécurité</Text>
          <Text style={helperText}>Vous êtes connecté(e). Vous pouvez vous déconnecter à tout moment.</Text>
          <BrandButton label="Se déconnecter" onPress={() => logout()} />
        </View>
      </>
    ) : (
      <View style={sectionCard}>
        <Text style={sectionTitle}>Bienvenue</Text>
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
const sectionTitle = { color: '#1f1a17', fontSize: 16, fontWeight: '800', marginBottom: 8 } as const;

const infoRow = { gap: 3 } as const;
const label = { color: '#7b746d', fontSize: 12, fontWeight: '700' } as const;
const value = { color: '#1f1a17', fontSize: 16, fontWeight: '700' } as const;
const divider = { height: 1, backgroundColor: '#efeae5', marginVertical: 10 } as const;
const helperText = { color: '#6f675f', marginBottom: 10, lineHeight: 19 } as const;

const secondaryButton = { borderWidth: 1, borderColor: '#d9d3cd', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8f6f3' } as const;
const secondaryButtonLabel = { color: '#1f1a17', fontWeight: '700' } as const;
