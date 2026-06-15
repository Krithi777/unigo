/**
 * TabNavigator.tsx — UniGo redesigned bottom tab bar.
 * Matches Figma: Home | Find Ride | SOS (center red) | My Rides | Profile
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/Home/HomeScreen';
import FindRideScreen from '../screens/FindRide/FindRideScreen';
import MyRidesScreen from '../screens/MyRides/MyRidesScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import SOSScreen from '../screens/Emergency/SOSScreen';

const Tab = createBottomTabNavigator();
const C = { brand: '#5B2EFF', red: '#DC2626', text: '#64748B', border: '#EAECF0', surface: '#FFFFFF' };

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={tabStyles.tabItem}>
      <Text style={tabStyles.icon}>{icon}</Text>
      <Text style={[tabStyles.label, focused && { color: C.brand, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

function SOSTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={tabStyles.sosOuter}>
      <View style={tabStyles.sosBtn}>
        <Text style={tabStyles.sosStar}>◈</Text>
      </View>
      <Text style={[tabStyles.label, { color: focused ? C.red : C.text, fontWeight: '700' }]}>SOS</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 2, paddingTop: 6 },
  icon: { fontSize: 22 },
  label: { fontSize: 10, fontWeight: '500', color: C.text, marginTop: 1 },
  sosOuter: { alignItems: 'center', marginTop: -20 },
  sosBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.red,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.red, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  sosStar: { color: '#fff', fontSize: 26, fontWeight: '900' },
});

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopWidth: 1,
          borderTopColor: C.border,
          height: 72,
          paddingBottom: 8,
          shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 10,
        },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.text,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="FindRide"
        component={FindRideScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="🔍" label="Find Ride" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="SOS"
        component={SOSScreen}
        options={{
          tabBarIcon: ({ focused }) => <SOSTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="MyRides"
        component={MyRidesScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="🚗" label="My Rides" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Profile" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
