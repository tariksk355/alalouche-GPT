import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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
import { ReservationsScreen } from '../screens/ReservationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useLanguage } from '../contexts/LanguageContext';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  const { t } = useLanguage();
  const tabIconByRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
    Menu: 'restaurant-outline',
    Cart: 'bag-handle-outline',
    Orders: 'receipt-outline',
    Reservations: 'calendar-outline',
    Profile: 'person-outline',
  };

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => {
        const iconName = tabIconByRoute[route.name] || 'ellipse-outline';
        return {
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: '#161210',
          tabBarInactiveTintColor: '#8b8178',
<<<<<<< HEAD
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginBottom: 4,
            textAlign: 'center',
          },
=======
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginBottom: 4,
            textAlign: 'center',
          },
>>>>>>> codex/absorb-context-for-mobile-app-development
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? iconName.replace('-outline', '') as keyof typeof Ionicons.glyphMap : iconName}
              size={size}
              color={color}
            />
          ),
<<<<<<< HEAD
          tabBarIconStyle: {
            marginTop: 6,
          },
          tabBarItemStyle: {
            minWidth: 0,
            paddingHorizontal: 3,
          },
          tabBarStyle: {
            height: 74,
            paddingTop: 6,
            paddingBottom: 8,
            paddingHorizontal: 10,
            backgroundColor: '#f9f7f4',
            borderTopColor: '#e8e2dc',
            borderTopWidth: 1,
=======
          tabBarIconStyle: {
            marginTop: 6,
          },
          tabBarItemStyle: {
            minWidth: 0,
            paddingHorizontal: 3,
          },
          tabBarStyle: {
            height: 74,
            paddingTop: 6,
            paddingBottom: 8,
            paddingHorizontal: 10,
            backgroundColor: '#f9f7f4',
            borderTopColor: '#e8e2dc',
            borderTopWidth: 1,
>>>>>>> codex/absorb-context-for-mobile-app-development
          },
        };
      }}
    >
      <Tabs.Screen name="Menu" component={MenuScreen} options={{ title: t('tab_menu') }} />
      <Tabs.Screen name="Cart" component={CartScreen} options={{ title: t('tab_cart') }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: t('tab_orders') }} />
      <Tabs.Screen name="Reservations" component={ReservationsScreen} options={{ title: t('tab_reservations') }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: t('tab_profile') }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { loading } = useAuth();
  const { t, ready } = useLanguage();
  if (loading || !ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: t('screen_product') }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: t('screen_checkout') }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: t('screen_login') }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: t('screen_signup') }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: t('screen_forgot') }} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: t('screen_reset') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('settings_title') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
