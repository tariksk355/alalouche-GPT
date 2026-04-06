import Constants from 'expo-constants';

let hasWarnedOneSignalUnavailable = false;

function getOneSignal() {
  // Expo Go runtime does not include native OneSignal module.
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    // Loaded lazily so Expo Go can run even when native OneSignal module
    // is not present in the runtime binary.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const oneSignalModule = require('react-native-onesignal');
    return oneSignalModule?.default ?? oneSignalModule;
  } catch {
    if (!hasWarnedOneSignalUnavailable) {
      hasWarnedOneSignalUnavailable = true;
      console.warn('[onesignal] native module unavailable in this runtime; skipping OneSignal setup');
    }
    return null;
  }
}

export function initOneSignal() {
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return;
  const oneSignal = getOneSignal();
  if (!oneSignal) return;
  try {
    oneSignal.Debug?.setLogLevel?.(0);
    oneSignal.initialize?.(appId);
    oneSignal.Notifications?.requestPermission?.(true);
    oneSignal.Notifications?.addEventListener?.('click', (event: any) => {
      console.log('[onesignal] opened', event.notification?.notificationId);
    });
  } catch {
    // keep safe for unsupported runtime (e.g. Expo Go)
  }
}

export function setOneSignalCustomerIdentity(customerId?: string) {
  if (!customerId) return;
  const oneSignal = getOneSignal();
  if (!oneSignal) return;
  try {
    oneSignal.login(customerId);
  } catch {
    // keep safe for unsupported runtime
  }
}

export function clearOneSignalCustomerIdentity() {
  const oneSignal = getOneSignal();
  if (!oneSignal) return;
  try {
    oneSignal.logout();
  } catch {
    // noop
  }
}
