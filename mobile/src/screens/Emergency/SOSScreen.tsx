import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SOSScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🚨</Text>
      <Text style={styles.title}>Emergency SOS</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F0' },
  icon:  { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 6 },
  sub:   { fontSize: 14, color: '#999' },
});
