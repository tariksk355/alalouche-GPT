import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearStoredCustomerSession, fetchCustomerMe, getStoredCustomerSession } from '@/lib/customerAuth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const refreshSession = async () => {
    setIsLoadingAuth(true);
    const session = getStoredCustomerSession();

    if (!session?.token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      return;
    }

    try {
      const customer = await fetchCustomerMe(session.token);
      setUser(customer);
      setIsAuthenticated(true);
    } catch {
      clearStoredCustomerSession();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const logout = () => {
    clearStoredCustomerSession();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, refreshSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};