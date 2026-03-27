import React from 'react';
import { View, Text } from 'react-native';
import { Sentry } from '../services/sentry';

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error);
  }

  render() {
    if (this.state.hasError) {
      return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Une erreur est survenue.</Text></View>;
    }
    return this.props.children;
  }
}
