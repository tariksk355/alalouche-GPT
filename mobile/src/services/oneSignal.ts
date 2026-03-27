import OneSignal from 'react-native-onesignal';

export function initOneSignal() {
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return;
  OneSignal.Debug.setLogLevel(0);
  OneSignal.initialize(appId);
  OneSignal.Notifications.requestPermission(true);
  OneSignal.Notifications.addEventListener('click', (event) => {
    console.log('[onesignal] opened', event.notification?.notificationId);
  });
}

export function setOneSignalCustomerIdentity(customerId?: string) {
  if (!customerId) return;
  try {
    OneSignal.login(customerId);
  } catch {
    // keep safe for unsupported runtime
  }
}

export function clearOneSignalCustomerIdentity() {
  try {
    OneSignal.logout();
  } catch {
    // noop
  }
}
