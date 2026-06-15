import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from './types';
import JoinCommunityScreen  from '../screens/Onboarding/JoinCommunityScreen';
import OrgVerifyScreen      from '../screens/Onboarding/OrgVerifyScreen';
import NeighbourhoodScreen  from '../screens/Onboarding/NeighbourhoodScreen';
import TrustCircleScreen    from '../screens/Onboarding/TrustCircleScreen';
import CreateCommunityScreen from '../screens/Onboarding/CreateCommunityScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="JoinCommunity"   component={JoinCommunityScreen} />
      <Stack.Screen name="OrgVerify"       component={OrgVerifyScreen} />
      <Stack.Screen name="Neighbourhood"   component={NeighbourhoodScreen} />
      <Stack.Screen name="TrustCircle"     component={TrustCircleScreen} />
      <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
    </Stack.Navigator>
  );
}
