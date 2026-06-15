// mobile/src/navigation/RootNavigator.tsx
//
// Routes based on auth state:
//   No user         → AuthNavigator  (Entry screen)
//   Admin user      → AdminNavigator
//   User, no comm.  → OnboardingNavigator
//   User + comm.    → TabNavigator

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import TabNavigator from './TabNavigator';
import AdminNavigator from './AdminNavigator';
import { Colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, communities, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const needsOnboarding = user && !isAdmin && communities.length === 0;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : isAdmin ? (
          <Stack.Screen name="Admin" component={AdminNavigator} />
        ) : needsOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : (
          <Stack.Screen name="App" component={TabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}