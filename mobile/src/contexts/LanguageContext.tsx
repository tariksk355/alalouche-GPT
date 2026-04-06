import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLanguage = 'fr' | 'de' | 'en' | 'tr';

const STORAGE_KEY = 'mobile_app_language_v1';

const DICTIONARY: Record<AppLanguage, Record<string, string>> = {
  fr: {
    tab_menu: 'Menu',
    tab_cart: 'Panier',
    tab_orders: 'Commandes',
    tab_profile: 'Profil',
    tab_settings: 'Réglages',
    screen_product: 'Produit',
    screen_checkout: 'Paiement',
    screen_login: 'Connexion',
    screen_signup: 'Inscription',
    screen_forgot: 'Mot de passe oublié',
    screen_reset: 'Réinitialiser',
    settings_title: 'Réglages',
    settings_subtitle: 'Personnalisez votre expérience en toute simplicité.',
    settings_language_title: 'Langue',
    settings_language_hint: 'Choisissez la langue de l’application.',
    settings_help_title: 'Aide & contact',
    settings_help_label: 'Email support',
    settings_help_value: 'alalouche.fr@gmail.com',
    settings_info_title: 'Informations',
    settings_info_app: 'Application',
    settings_info_name: 'Al A Louche',
    settings_info_version: 'Version',
  },
  de: {
    tab_menu: 'Menü',
    tab_cart: 'Warenkorb',
    tab_orders: 'Bestellungen',
    tab_profile: 'Profil',
    tab_settings: 'Einstellungen',
    screen_product: 'Produkt',
    screen_checkout: 'Kasse',
    screen_login: 'Anmelden',
    screen_signup: 'Registrieren',
    screen_forgot: 'Passwort vergessen',
    screen_reset: 'Zurücksetzen',
    settings_title: 'Einstellungen',
    settings_subtitle: 'Personalisieren Sie Ihre Erfahrung ganz einfach.',
    settings_language_title: 'Sprache',
    settings_language_hint: 'Wählen Sie die Sprache der App.',
    settings_help_title: 'Hilfe & Kontakt',
    settings_help_label: 'Support-E-Mail',
    settings_help_value: 'alalouche.fr@gmail.com',
    settings_info_title: 'Informationen',
    settings_info_app: 'App',
    settings_info_name: 'Al A Louche',
    settings_info_version: 'Version',
  },
  en: {
    tab_menu: 'Menu',
    tab_cart: 'Cart',
    tab_orders: 'Orders',
    tab_profile: 'Profile',
    tab_settings: 'Settings',
    screen_product: 'Product',
    screen_checkout: 'Checkout',
    screen_login: 'Login',
    screen_signup: 'Sign up',
    screen_forgot: 'Forgot password',
    screen_reset: 'Reset',
    settings_title: 'Settings',
    settings_subtitle: 'Personalize your experience with ease.',
    settings_language_title: 'Language',
    settings_language_hint: 'Choose the app language.',
    settings_help_title: 'Help & contact',
    settings_help_label: 'Support email',
    settings_help_value: 'alalouche.fr@gmail.com',
    settings_info_title: 'Information',
    settings_info_app: 'App',
    settings_info_name: 'Al A Louche',
    settings_info_version: 'Version',
  },
  tr: {
    tab_menu: 'Menü',
    tab_cart: 'Sepet',
    tab_orders: 'Siparişler',
    tab_profile: 'Profil',
    tab_settings: 'Ayarlar',
    screen_product: 'Ürün',
    screen_checkout: 'Ödeme',
    screen_login: 'Giriş',
    screen_signup: 'Kayıt',
    screen_forgot: 'Şifremi unuttum',
    screen_reset: 'Sıfırla',
    settings_title: 'Ayarlar',
    settings_subtitle: 'Deneyiminizi sade bir şekilde kişiselleştirin.',
    settings_language_title: 'Dil',
    settings_language_hint: 'Uygulama dilini seçin.',
    settings_help_title: 'Yardım & iletişim',
    settings_help_label: 'Destek e-postası',
    settings_help_value: 'alalouche.fr@gmail.com',
    settings_info_title: 'Bilgi',
    settings_info_app: 'Uygulama',
    settings_info_name: 'Al A Louche',
    settings_info_version: 'Sürüm',
  },
};

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => Promise<void>;
  t: (key: string) => string;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('fr');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'fr' || saved === 'de' || saved === 'en' || saved === 'tr') {
          setLanguageState(saved);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: async (next) => {
      setLanguageState(next);
      await AsyncStorage.setItem(STORAGE_KEY, next);
    },
    t: (key) => DICTIONARY[language][key] || DICTIONARY.fr[key] || key,
    ready,
  }), [language, ready]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
