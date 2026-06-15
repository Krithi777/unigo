/**
 * AuthNavigator — covers all three entry paths (Rider, Driver, Admin).
 *
 * Entry  ─┬─ RiderEmailEntry → RiderEmailVerifyWaiting → RiderProfileSetup
 *          ├─ DriverEmailEntry → DriverEmailVerifyWaiting → DriverSetup → DriverPendingReview
 *          └─ AdminSignIn (email + password)
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';

import EntryScreen               from '../screens/Auth/EntryScreen';
import RiderEmailEntryScreen     from '../screens/Auth/RiderEmailEntryScreen';
import RiderEmailVerifyWaiting   from '../screens/Auth/RiderEmailVerifyWaiting';
import RiderProfileSetupScreen   from '../screens/Auth/RiderProfileSetupScreen';
import DriverEmailEntryScreen    from '../screens/Auth/DriverEmailEntryScreen';
import DriverEmailVerifyWaiting  from '../screens/Auth/DriverEmailVerifyWaiting';
import DriverSetupScreen         from '../screens/Auth/DriverSetupScreen';
import DriverPendingReviewScreen from '../screens/Auth/DriverPendingReviewScreen';
import AdminSignInScreen         from '../screens/Auth/AdminSignInScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName="Entry"
    >
      <Stack.Screen name="Entry"                   component={EntryScreen} />
      {/* Rider path */}
      <Stack.Screen name="RiderEmailEntry"         component={RiderEmailEntryScreen} />
      <Stack.Screen name="RiderEmailVerifyWaiting" component={RiderEmailVerifyWaiting} />
      <Stack.Screen name="RiderProfileSetup"       component={RiderProfileSetupScreen} />
      {/* Driver path */}
      <Stack.Screen name="DriverEmailEntry"        component={DriverEmailEntryScreen} />
      <Stack.Screen name="DriverEmailVerifyWaiting" component={DriverEmailVerifyWaiting} />
      <Stack.Screen name="DriverSetup"             component={DriverSetupScreen} />
      <Stack.Screen name="DriverPendingReview"     component={DriverPendingReviewScreen} />
      {/* Admin path */}
      <Stack.Screen name="AdminSignIn"             component={AdminSignInScreen} />
    </Stack.Navigator>
  );
}
