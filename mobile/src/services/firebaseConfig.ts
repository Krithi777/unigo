// firebaseConfig.ts
// Firebase client SDK removed — all auth is handled server-side.
// The backend issues a session token directly after OTP verification.

export const firebaseAuth = {
  signOut: async () => {
    // handled by clearing storage in authService
  },
  currentUser: null as null,
};

export default null;