import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';

import { restoreSession, signOut as firebaseSignOut } from '../services/authService';

export interface AuthUser {
  id: string;
  firebase_uid: string;
  name: string;
  phone: string;
  gender: string;
  role: 'rider' | 'driver' | 'both';
  reliability_score: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  is_admin?: boolean;
}

export interface DriverProfile {
  user_id: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_number: string;
  vehicle_color?: string;
  vehicle_type?: string;
  seats_available_default?: number;
  is_active: boolean;
  license_verified: boolean;
  rc_verified?: boolean;
  insurance_verified?: boolean;
  puc_verified?: boolean;
  // submission_state: 'incomplete' | 'pending_review' | 'action_required' | 'active'
  submission_state?: string;
}

interface AuthState {
  user: AuthUser | null;
  communities: any[];
  driverProfile: DriverProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setSession: (user: AuthUser, communities: any[], driverProfile?: DriverProfile | null) => void;
  setDriverProfile: (dp: DriverProfile | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  communities: [],
  driverProfile: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  setSession: () => {},
  setDriverProfile: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [communities, setCommunities] = useState<any[]>([]);
  const [driverProfile, setDriverProfileState] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreSession()
      .then((session) => {
        if (session) {
          setUser(session.user);
          setCommunities(session.communities);
          setDriverProfileState(session.driverProfile ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const setSession = useCallback((u: AuthUser, c: any[], dp?: DriverProfile | null) => {
    setUser(u);
    setCommunities(c);
    setDriverProfileState(dp ?? null);
  }, []);

  const setDriverProfile = useCallback((dp: DriverProfile | null) => {
    setDriverProfileState(dp);
  }, []);

  const handleSignOut = useCallback(async () => {
    await firebaseSignOut();
    setUser(null);
    setCommunities([]);
    setDriverProfileState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        communities,
        driverProfile,
        loading,
        isAuthenticated: !!user,
        isAdmin: !!user?.is_admin,
        setSession,
        setDriverProfile,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);