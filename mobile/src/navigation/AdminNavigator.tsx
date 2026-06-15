// mobile/src/navigation/AdminNavigator.tsx

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStackParamList } from './types';
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import AdminDriverDetailScreen from '../screens/Admin/AdminDriverDetailScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName="AdminDashboard"
    >
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminDriverDetail" component={AdminDriverDetailScreen} />
    </Stack.Navigator>
  );
}