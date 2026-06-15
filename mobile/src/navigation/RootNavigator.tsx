import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TabNavigator from './TabNavigator';
import LiveTrackingScreen from '../screens/RideDetails/LiveTrackingScreen';
import RideDetailsScreen from '../screens/RideDetails/RideDetailsScreen';
import SmartSplitScreen from '../screens/RideDetails/SmartSplitScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  RiderActiveRide: { rideId: string; rideInfo?: string };
  RideDetails: { rideId: string };
  SmartSplit: { rideId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        <Stack.Screen name="RiderActiveRide" component={LiveTrackingScreen} />
        <Stack.Screen name="RideDetails" component={RideDetailsScreen} />
        <Stack.Screen name="SmartSplit" component={SmartSplitScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
