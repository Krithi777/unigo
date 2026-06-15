import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

export type EntryRole = 'rider' | 'driver' | 'admin';

// ─── Auth Stack ───────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Entry: undefined;
  // Rider path
  RiderEmailEntry: undefined;
  RiderEmailVerifyWaiting: { email: string };
  RiderProfileSetup: { idToken: string; firebase_uid: string; email: string };
  // Driver path
  DriverEmailEntry: undefined;
  DriverEmailVerifyWaiting: { email: string };
  DriverSetup: { idToken: string; firebase_uid: string; email: string };
  DriverPendingReview: undefined;
  // Admin path
  AdminSignIn: undefined;
};

// ─── Onboarding Stack ────────────────────────────────────────────────────────
export type OnboardingStackParamList = {
  JoinCommunity: undefined;
  OrgVerify: undefined;
  Neighbourhood: undefined;
  TrustCircle: undefined;
  CreateCommunity: undefined;
};

// ─── Root Stack ───────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  App: undefined;
  AdminDashboard: undefined;
  DriverSetupResume: undefined;
  DriverPendingReview: undefined;
};

// ─── App Tabs ─────────────────────────────────────────────────────────────────
export type TabParamList = {
  Home: undefined;
  FindRide: undefined;
  SOS: undefined;
  MyRides: undefined;
  Profile: undefined;
};

// ─── Admin Stack ─────────────────────────────────────────────────────────────
export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminDriverDetail: { driverId: string; driverName: string };
};

// Convenience helpers
export type AuthNavProp<T extends keyof AuthStackParamList> =
  NativeStackNavigationProp<AuthStackParamList, T>;
export type AuthRouteProp<T extends keyof AuthStackParamList> =
  RouteProp<AuthStackParamList, T>;
export type OnboardingNavProp<T extends keyof OnboardingStackParamList> =
  NativeStackNavigationProp<OnboardingStackParamList, T>;
export type AdminNavProp<T extends keyof AdminStackParamList> =
  NativeStackNavigationProp<AdminStackParamList, T>;
export type AdminRouteProp<T extends keyof AdminStackParamList> =
  RouteProp<AdminStackParamList, T>;
