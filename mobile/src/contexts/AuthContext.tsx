import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, CustomerSession, UpdateCustomerProfilePayload } from '../api/auth';
import { clearOneSignalCustomerIdentity, setOneSignalCustomerIdentity } from '../services/oneSignal';

const STORAGE_KEY = 'mobile_customer_session_v1';

type AuthContextValue = {
  session: CustomerSession | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: { email: string; password: string; fullName: string; phone: string; subscribedEmail?: boolean }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (payload: UpdateCustomerProfilePayload) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setSession(JSON.parse(raw));
    }).finally(() => setLoading(false));
  }, []);

  const persist = async (next: CustomerSession | null) => {
    setSession(next);
    if (next) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      try {
        setOneSignalCustomerIdentity(next.customer?.id);
      } catch {
        // oneSignal integration must never block auth persistence
      }
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
      try {
        clearOneSignalCustomerIdentity();
      } catch {
        // oneSignal integration must never block auth persistence
      }
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    login: async (email, password) => {
      const next = await authApi.login({ email, password });
      await persist(next);
    },
    signup: async (payload) => {
      const next = await authApi.signup(payload);
      await persist(next);
    },
    refreshProfile: async () => {
      if (!session?.token) return;
      const data = await authApi.me(session.token);
      await persist({ ...session, customer: data.customer });
    },
    updateProfile: async (payload) => {
      if (!session?.token) {
        throw new Error('Session introuvable. Veuillez vous reconnecter.');
      }
      const data = await authApi.updateMe(session.token, payload);
      await persist({ ...session, customer: data.customer });
    },
    deleteAccount: async () => {
      if (!session?.token) {
        throw new Error('Session introuvable. Veuillez vous reconnecter.');
      }
      await authApi.deleteMe(session.token);
      await persist(null);
    },
    logout: async () => persist(null),
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
