import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './navigation/AppNavigator';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { initOneSignal } from './services/oneSignal';
import { initSentry } from './services/sentry';
import { AppErrorBoundary } from './components/AppErrorBoundary';

initSentry();
initOneSignal();

export default function App() {
  return (
    <AppErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <AppNavigator />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  );
}
