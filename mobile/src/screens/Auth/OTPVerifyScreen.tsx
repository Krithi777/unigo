import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function OTPVerifyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>🔐</Text>
      <Text style={styles.label}>OTP Verify</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 48, marginBottom: 12 },
  label: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
});
