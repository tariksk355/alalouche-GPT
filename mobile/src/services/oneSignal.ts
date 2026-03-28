let hasWarnedOneSignalUnavailable = false;

function getOneSignal() {
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
  oneSignal.Debug.setLogLevel(0);
  oneSignal.initialize(appId);
  oneSignal.Notifications.requestPermission(true);
  oneSignal.Notifications.addEventListener('click', (event) => {
    console.log('[onesignal] opened', event.notification?.notificationId);
  });
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
