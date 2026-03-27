import * as Sentry from '@sentry/react-native';

export { Sentry };

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    enableAutoSessionTracking: true,
  });
}
