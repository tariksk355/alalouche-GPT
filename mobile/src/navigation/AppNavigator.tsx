import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { MenuScreen } from '../screens/MenuScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CartScreen } from '../screens/CartScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Menu" component={MenuScreen} />
      <Tabs.Screen name="Cart" component={CartScreen} options={{ title: 'Panier' }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: 'Commandes' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: 'Réglages' }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { session, loading } = useAuth();
  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Connexion' }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Inscription' }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Mot de passe oublié' }} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Réinitialiser' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Produit' }} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
