// Root app entry — wraps app in providers and renders RootNavigator
console.log("API_BASE_URL =", process.env.EXPO_PUBLIC_API_BASE_URL);
import React from 'react';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}