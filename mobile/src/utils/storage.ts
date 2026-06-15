import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  firebaseToken: '@unigo/firebase_token',
  user: '@unigo/user',
  communities: '@unigo/communities',
  driverProfile: '@unigo/driver_profile',
};

export const Storage = {
  async saveSession(
    token: string,
    user: object,
    communities: object[],
    driverProfile: object | null,
  ) {
    await AsyncStorage.multiSet([
      [KEYS.firebaseToken, token],
      [KEYS.user, JSON.stringify(user)],
      [KEYS.communities, JSON.stringify(communities)],
      [KEYS.driverProfile, JSON.stringify(driverProfile)],
    ]);
  },

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.firebaseToken);
  },

  async getUser(): Promise<any | null> {
    const raw = await AsyncStorage.getItem(KEYS.user);
    return raw ? JSON.parse(raw) : null;
  },

  async getCommunities(): Promise<any[]> {
    const raw = await AsyncStorage.getItem(KEYS.communities);
    return raw ? JSON.parse(raw) : [];
  },

  async getDriverProfile(): Promise<any | null> {
    const raw = await AsyncStorage.getItem(KEYS.driverProfile);
    return raw ? JSON.parse(raw) : null;
  },

  async clearSession() {
    await AsyncStorage.multiRemove([
      KEYS.firebaseToken,
      KEYS.user,
      KEYS.communities,
      KEYS.driverProfile,
    ]);
  },
};