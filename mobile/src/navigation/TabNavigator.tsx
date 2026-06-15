/**
 * TabNavigator — Bottom tab bar combining:
 *   - unigo3 navigation structure (React Navigation bottom tabs)
 *   - unigo1 custom SVG-style tab icons and SOS raised button
 *
 * Tabs: Home | Find | SOS (raised) | Rides | Profile
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

import HomeScreen    from '../screens/Home/HomeScreen';
import FindRideScreen from '../screens/FindRide/FindRideScreen';
import SOSScreen     from '../screens/Emergency/SOSScreen';
import MyRidesScreen from '../screens/MyRides/MyRidesScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

const Tab = createBottomTabNavigator();

// ── Custom tab icons (ported from unigo1) ────────────────────────────────────

type TabName = 'Home' | 'FindRide' | 'SOS' | 'MyRides' | 'Profile';

function TabIcon({ name, active }: { name: TabName; active: boolean }) {
  const color = active ? '#6C63FF' : '#888';

  if (name === 'Home') {
    return (
      <View style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color, marginBottom: -1 }} />
        <View style={{ width: 18, height: 11, backgroundColor: active ? '#6C63FF' : 'transparent', borderWidth: active ? 0 : 1.8, borderColor: '#888', borderTopWidth: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 1 }}>
          <View style={{ width: 5, height: 6, backgroundColor: active ? '#fff' : '#888', borderRadius: 1 }} />
        </View>
      </View>
    );
  }

  if (name === 'FindRide') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: color, position: 'absolute', top: 0, left: 0 }} />
        <View style={{ width: 2, height: 8, backgroundColor: color, position: 'absolute', bottom: 0, right: 2, transform: [{ rotate: '-45deg' }], borderRadius: 1 }} />
      </View>
    );
  }

  if (name === 'MyRides') {
    return (
      <View style={{ width: 28, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 3, top: 0, bottom: 0, width: 2.5, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ position: 'absolute', right: 3, top: 0, bottom: 0, width: 2.5, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ position: 'absolute', top: 2, width: 2, height: 6, backgroundColor: color, borderRadius: 1, alignSelf: 'center' }} />
        <View style={{ position: 'absolute', top: 11, width: 2, height: 6, backgroundColor: color, borderRadius: 1, alignSelf: 'center' }} />
      </View>
    );
  }

  if (name === 'Profile') {
    return (
      <View style={{ width: 22, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: active ? '#6C63FF' : 'transparent', borderWidth: active ? 0 : 1.8, borderColor: color, marginBottom: 3 }} />
        <View style={{ width: 20, height: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: active ? '#6C63FF' : 'transparent', borderWidth: active ? 0 : 1.8, borderColor: color, borderBottomWidth: 0 }} />
      </View>
    );
  }

  return null;
}

// ── Custom tab bar ────────────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: any) {
  const routes: TabName[] = ['Home', 'FindRide', 'SOS', 'MyRides', 'Profile'];
  const labels: Record<TabName, string> = { Home: 'Home', FindRide: 'Find', SOS: 'SOS', MyRides: 'Rides', Profile: 'Profile' };

  return (
    <View style={tabStyles.bar}>
      {routes.map((name) => {
        const index = state.routes.findIndex((r: any) => r.name === name);
        const active = state.index === index;

        if (name === 'SOS') {
          return (
            <TouchableOpacity
              key="SOS"
              style={tabStyles.sosWrapper}
              onPress={() => navigation.navigate('SOS')}
              activeOpacity={0.85}
            >
              <View style={tabStyles.sosCircle}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 20, height: 22, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderWidth: 2.5, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 }}>!</Text>
                  </View>
                </View>
              </View>
              <Text style={tabStyles.sosLabel}>SOS</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={name}
            style={tabStyles.tab}
            onPress={() => navigation.navigate(name)}
            activeOpacity={0.7}
          >
            <TabIcon name={name} active={active} />
            <Text style={[tabStyles.label, active && tabStyles.labelActive]}>
              {labels[name]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Navigator ─────────────────────────────────────────────────────────────────

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="FindRide" component={FindRideScreen} />
      <Tab.Screen name="SOS"      component={SOSScreen} />
      <Tab.Screen name="MyRides"  component={MyRidesScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
    paddingBottom: 10,
    paddingTop: 10,
    alignItems: 'flex-end',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 11, color: '#888', marginTop: 3 },
  labelActive: { color: '#6C63FF', fontWeight: '600' },
  sosWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 0 },
  sosCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#E53935',
    justifyContent: 'center', alignItems: 'center',
    marginTop: -24, marginBottom: 4,
    shadowColor: '#E53935', shadowOpacity: 0.45, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  sosLabel: { fontSize: 11, color: '#E53935', fontWeight: '700' },
});
