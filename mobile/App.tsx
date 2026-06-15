import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import ProfileSheet from './ProfileSheet';
import RidesScreen from './Ridesscreen';
import FindScreen from './FindScreen';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);
const USER_ROLE = 'rider'; // change to 'driver' to test driver view
const MOCK_USER_ID      = 'a1b2c3d4-0000-0000-0000-000000000001';
const MOCK_COMMUNITY_ID = 'c1b2c3d4-0000-0000-0000-000000000001';
const TODAY = new Date().toISOString().split('T')[0];

type PulseStatus = 'going' | 'not_going' | null;
type TabName     = 'Home' | 'Find' | 'SOS' | 'Rides' | 'Profile';

interface CommunityMember {
  user_id: string;
  name: string;
  commuting: boolean | null;
  is_returning: boolean | null;
  checked_in_at: string | null;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '🌅 Good Morning, Ruvanthika!';
  if (h < 17) return '☀️ Good Afternoon, Ruvanthika!';
  if (h < 21) return '🌆 Good Evening, Ruvanthika!';
  return '🌙 Good Night, Ruvanthika!';
}
function getTimeOfDay(): 'morning' | 'evening' {
  return new Date().getHours() < 14 ? 'morning' : 'evening';
}
function getNextMatchTime(): string {
  const now = new Date();
  const h = now.getHours(); const m = now.getMinutes();
  let matchH = h; let matchM: number;
  if (m === 0) { matchM = 0; } else if (m <= 30) { matchM = 30; } else { matchM = 0; matchH = h + 1; }
  const period = matchH >= 12 ? 'PM' : 'AM';
  const displayH = matchH > 12 ? matchH - 12 : matchH === 0 ? 12 : matchH;
  return `${displayH}:${matchM === 0 ? '00' : '30'} ${period}`;
}

// ─── Tab Icons ────────────────────────────────────────────────────────────────
function TabIcon({ name, active }: { name: TabName; active: boolean }) {
  const color = active ? '#1A73E8' : '#888';

  if (name === 'Home') {
    return (
      <View style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 0, height: 0,
          borderLeftWidth: 13, borderRightWidth: 13, borderBottomWidth: 10,
          borderLeftColor: 'transparent', borderRightColor: 'transparent',
          borderBottomColor: active ? '#1A73E8' : '#888',
          marginBottom: -1,
        }} />
        <View style={{
          width: 18, height: 11,
          backgroundColor: active ? '#1A73E8' : 'transparent',
          borderWidth: active ? 0 : 1.8,
          borderColor: '#888',
          borderTopWidth: 0,
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: 1,
        }}>
          <View style={{
            width: 5, height: 6,
            backgroundColor: active ? '#fff' : '#888',
            borderRadius: 1,
          }} />
        </View>
      </View>
    );
  }

  if (name === 'Find') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 15, height: 15, borderRadius: 8,
          borderWidth: 2, borderColor: color,
          position: 'absolute', top: 0, left: 0,
        }} />
        <View style={{
          width: 2, height: 8,
          backgroundColor: color,
          position: 'absolute', bottom: 0, right: 2,
          transform: [{ rotate: '-45deg' }],
          borderRadius: 1,
        }} />
      </View>
    );
  }

  // ── Rides: road / route icon (two parallel lines + location pins) ──────────
  if (name === 'Rides') {
    return (
      <View style={{ width: 28, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {/* Left road lane */}
        <View style={{
          position: 'absolute',
          left: 3, top: 0, bottom: 0,
          width: 2.5,
          backgroundColor: color,
          borderRadius: 2,
        }} />
        {/* Right road lane */}
        <View style={{
          position: 'absolute',
          right: 3, top: 0, bottom: 0,
          width: 2.5,
          backgroundColor: color,
          borderRadius: 2,
        }} />
        {/* Center dashes */}
        <View style={{ position: 'absolute', top: 2, width: 2, height: 6, backgroundColor: color, borderRadius: 1, alignSelf: 'center' }} />
        <View style={{ position: 'absolute', top: 11, width: 2, height: 6, backgroundColor: color, borderRadius: 1, alignSelf: 'center' }} />
        {/* Location pin top */}
        <View style={{
          position: 'absolute', top: -1, alignSelf: 'center',
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: active ? '#1A73E8' : 'transparent',
          borderWidth: active ? 0 : 2,
          borderColor: color,
        }} />
        {/* Dot at bottom */}
        <View style={{
          position: 'absolute', bottom: 0, alignSelf: 'center',
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: active ? '#1A73E8' : color,
        }} />
      </View>
    );
  }

  // ── Profile: person silhouette ───────────────────────────────────────────
  if (name === 'Profile') {
    return (
      <View style={{ width: 22, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 11, height: 11, borderRadius: 6,
          backgroundColor: active ? '#1A73E8' : 'transparent',
          borderWidth: active ? 0 : 1.8,
          borderColor: color,
          marginBottom: 3,
        }} />
        <View style={{
          width: 20, height: 10,
          borderTopLeftRadius: 10, borderTopRightRadius: 10,
          backgroundColor: active ? '#1A73E8' : 'transparent',
          borderWidth: active ? 0 : 1.8,
          borderColor: color,
          borderBottomWidth: 0,
        }} />
      </View>
    );
  }

  return null;
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
function TabBar({
  activeTab, onTabPress,
}: { activeTab: TabName; onTabPress: (t: TabName) => void }) {
  const regularTabs: { name: TabName; label: string }[] = [
    { name: 'Home',  label: 'Home'  },
    { name: 'Find',  label: 'Find'  },
  ];
  const rightTabs: { name: TabName; label: string }[] = [
    { name: 'Rides',   label: 'Rides'   },
    { name: 'Profile', label: 'Profile' },
  ];

  return (
    <View style={tabStyles.bar}>
      {regularTabs.map(t => (
        <TouchableOpacity
          key={t.name}
          style={tabStyles.tab}
          onPress={() => onTabPress(t.name)}
          activeOpacity={0.7}
        >
          <TabIcon name={t.name} active={activeTab === t.name} />
          <Text style={[tabStyles.label, activeTab === t.name && tabStyles.labelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* SOS — raised circle */}
      <TouchableOpacity
        style={tabStyles.sosWrapper}
        onPress={() => onTabPress('SOS')}
        activeOpacity={0.85}
      >
        <View style={tabStyles.sosCircle}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
              width: 20, height: 22,
              borderTopLeftRadius: 10, borderTopRightRadius: 10,
              borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
              borderWidth: 2.5, borderColor: '#fff',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 }}>!</Text>
            </View>
          </View>
        </View>
        <Text style={tabStyles.sosLabel}>SOS</Text>
      </TouchableOpacity>

      {rightTabs.map(t => (
        <TouchableOpacity
          key={t.name}
          style={tabStyles.tab}
          onPress={() => onTabPress(t.name)}
          activeOpacity={0.7}
        >
          <TabIcon name={t.name} active={activeTab === t.name} />
          <Text style={[tabStyles.label, activeTab === t.name && tabStyles.labelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Placeholder screens ──────────────────────────────────────────────────────

function SOSScreen()   { return <View style={[styles.placeholder,{backgroundColor:'#FFF0F0'}]}><Text style={styles.phIcon}>🚨</Text><Text style={styles.phTitle}>Emergency SOS</Text><Text style={styles.phSub}>Coming soon</Text></View>; }

// ─── Home / Daily Pulse Screen ────────────────────────────────────────────────
function HomeScreen({ onProfilePress }: { onProfilePress: () => void }) {
  const [morningStatus, setMorningStatus] = useState<PulseStatus>(null);
  const [eveningStatus, setEveningStatus] = useState<PulseStatus>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [members,  setMembers]  = useState<CommunityMember[]>([]);
  const channelRef = useRef<any>(null);

  const timeOfDay = getTimeOfDay();
  const matchTime = getNextMatchTime();

  useEffect(() => {
    fetchMyPulse();
    fetchCommunityPulse();

    channelRef.current = supabase
      .channel('daily_pulse_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_pulse', filter: `date=eq.${TODAY}` },
        () => fetchCommunityPulse()
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  const fetchMyPulse = async () => {
    const { data } = await supabase
      .from('daily_pulse')
      .select('commuting, is_returning')
      .eq('user_id', MOCK_USER_ID)
      .eq('date', TODAY)
      .single();
    if (data) {
      if (data.commuting    !== null) setMorningStatus(data.commuting    ? 'going' : 'not_going');
      if (data.is_returning !== null) setEveningStatus(data.is_returning ? 'going' : 'not_going');
    }
    setLoading(false);
  };

  const fetchCommunityPulse = async () => {
    const { data: memberRows } = await supabase
      .from('community_members')
      .select('user_id, users(name)')
      .eq('community_id', MOCK_COMMUNITY_ID);
    if (!memberRows) return;
    const userIds = memberRows.map((m: any) => m.user_id);
    const { data: pulseRows } = await supabase
      .from('daily_pulse')
      .select('user_id, commuting, is_returning, created_at')
      .eq('date', TODAY)
      .in('user_id', userIds);
    setMembers(memberRows.map((m: any) => {
      const pulse = pulseRows?.find((p: any) => p.user_id === m.user_id);
      return {
        user_id:       m.user_id,
        name:          m.users?.name ?? 'Member',
        commuting:     pulse?.commuting    ?? null,
        is_returning:  pulse?.is_returning ?? null,
        checked_in_at: pulse?.created_at  ?? null,
      };
    }));
  };

  const handleMorningResponse = async (going: boolean) => {
    setSaving(true);
    await supabase.from('daily_pulse').upsert(
      { user_id: MOCK_USER_ID, date: TODAY, commuting: going, departure_window: matchTime },
      { onConflict: 'user_id,date' }
    );
    setMorningStatus(going ? 'going' : 'not_going');
    setSaving(false);
    fetchCommunityPulse();
  };

  const handleEveningResponse = async (going: boolean) => {
    setSaving(true);
    await supabase.from('daily_pulse').upsert(
      { user_id: MOCK_USER_ID, date: TODAY, is_returning: going, departure_window: matchTime },
      { onConflict: 'user_id,date' }
    );
    setEveningStatus(going ? 'going' : 'not_going');
    setSaving(false);
    fetchCommunityPulse();
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatTime = (iso: string | null) => {
    if (!iso) return "Hasn't checked in yet";
    const d = new Date(iso);
    const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `Checked in at ${displayH}:${m} ${period}`;
  };

  const avatarColors = ['#E8F0FE','#E6F4EA','#FEF0E0','#FCE8E6','#F3E8FD'];
  const textColors   = ['#1A73E8','#188038','#E37400','#C5221F','#7B1FA2'];

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1A73E8" /></View>;

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} 
          </Text>
        </View>
        <TouchableOpacity style={styles.profileIcon} onPress={onProfilePress} activeOpacity={0.75}>
          <Text style={styles.profileInitials}>RV</Text>
        </TouchableOpacity>
      </View>

      {/* Morning Pulse Card */}
      {timeOfDay === 'morning' && (
        <View style={styles.pulseCard}>
          <Text style={styles.cardLabel}>🌅 MORNING COMMUTE</Text>
          <Text style={styles.cardTitle}>Are you commuting today?</Text>
          <Text style={styles.cardSub}>Carpool will be matched at <Text style={styles.highlight}>{matchTime}</Text></Text>
          {morningStatus === null && (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnYes} onPress={() => handleMorningResponse(true)} disabled={saving}>
                <Text style={styles.btnIcon}>🚗</Text><Text style={styles.btnText}>Yes, I'm in!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnNo} onPress={() => handleMorningResponse(false)} disabled={saving}>
                <Text style={styles.btnIcon}>🏠</Text><Text style={styles.btnText}>Not today</Text>
              </TouchableOpacity>
            </View>
          )}
          {morningStatus === 'going' && (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedText}>🚗 You're commuting today!</Text>
              <Text style={styles.confirmedSub}>Your carpool will be matched at {matchTime}</Text>
              <TouchableOpacity onPress={() => setMorningStatus(null)}><Text style={styles.changeLink}>Change response</Text></TouchableOpacity>
            </View>
          )}
          {morningStatus === 'not_going' && (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedText}>🏠 Staying home today</Text>
              <Text style={styles.confirmedSub}>Your carpool group has been notified</Text>
              <TouchableOpacity onPress={() => setMorningStatus(null)}><Text style={styles.changeLink}>Change response</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Evening Pulse Card */}
      {timeOfDay === 'evening' && (
        <View style={[styles.pulseCard, { borderLeftColor: '#F4A261', borderLeftWidth: 4 }]}>
          <Text style={[styles.cardLabel, { color: '#E37400' }]}>🌆 EVENING RETURN</Text>
          <Text style={styles.cardTitle}>Are you heading back home today?</Text>
          <Text style={styles.cardSub}>Return carpool matched at <Text style={[styles.highlight, { color: '#E37400' }]}>{matchTime}</Text></Text>
          {eveningStatus === null && (
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btnYes, { backgroundColor: '#F4A261' }]} onPress={() => handleEveningResponse(true)} disabled={saving}>
                <Text style={styles.btnIcon}>🏠</Text><Text style={styles.btnText}>Yes, heading back!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnNo} onPress={() => handleEveningResponse(false)} disabled={saving}>
                <Text style={styles.btnIcon}>🏢</Text><Text style={styles.btnText}>Staying late</Text>
              </TouchableOpacity>
            </View>
          )}
          {eveningStatus === 'going' && (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedText}>🏠 Heading home today!</Text>
              <Text style={styles.confirmedSub}>Return carpool matched at {matchTime}</Text>
              <TouchableOpacity onPress={() => setEveningStatus(null)}><Text style={styles.changeLink}>Change response</Text></TouchableOpacity>
            </View>
          )}
          {eveningStatus === 'not_going' && (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedText}>🏢 Staying late today</Text>
              <Text style={styles.confirmedSub}>Your group has been notified</Text>
              <TouchableOpacity onPress={() => setEveningStatus(null)}><Text style={styles.changeLink}>Change response</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Community Pulse */}
      <View style={styles.communityCard}>
        <View style={styles.communityHeader}>
          <Text style={styles.communityTitle}>👥 Community Pulse</Text>
          <View style={styles.countPill}><Text style={styles.countText}>{members.length} members</Text></View>
        </View>
        <Text style={styles.communityNote}>
          {timeOfDay === 'morning' ? "🌅 Who's commuting today!" : "🌆 Who's heading back home today"}
        </Text>
        {members.length === 0 ? (
          <Text style={styles.emptyText}>No members found</Text>
        ) : members.map((m, i) => {
          const statusVal = timeOfDay === 'morning' ? m.commuting : m.is_returning;
          return (
            <View key={m.user_id} style={styles.memberItem}>
              <View style={[styles.avatar, { backgroundColor: avatarColors[i % avatarColors.length] }]}>
                <Text style={[styles.avatarText, { color: textColors[i % textColors.length] }]}>{getInitials(m.name)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberTime}>{formatTime(m.checked_in_at)}</Text>
              </View>
              {statusVal === null  && <View style={styles.badgePending}><Text style={styles.badgePendingText}>Pending</Text></View>}
              {statusVal === true  && <View style={styles.badgeGoing}><Text style={styles.badgeGoingText}>Going ✓</Text></View>}
              {statusVal === false && <View style={styles.badgeOut}><Text style={styles.badgeOutText}>Not today</Text></View>}
            </View>
          );
        })}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('Home');
  const [profileOpen, setProfileOpen] = useState(false);

  const handleTabPress = (tab: TabName) => {
    if (tab === 'Profile') {
      setProfileOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':  return <HomeScreen onProfilePress={() => setProfileOpen(true)} />;
      case 'Find':  return <FindScreen />;
      case 'SOS':   return <SOSScreen />;
      case 'Rides': return <RidesScreen />;
      default:      return <HomeScreen onProfilePress={() => setProfileOpen(true)} />;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      <View style={{ flex: 1 }}>{renderScreen()}</View>
      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
      <ProfileSheet
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        userName="Ruvanthika"
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: '#F0F4FF', padding: 20, paddingTop: 52 },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting:         { fontSize: 22, fontWeight: 'bold', color: '#1A1A2E' },
  date:             { fontSize: 13, color: '#666', marginTop: 3 },
  profileIcon:      { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  profileInitials:  { fontSize: 14, fontWeight: 'bold', color: '#1A73E8' },

  pulseCard:        { backgroundColor: '#fff', borderRadius: 20, padding: 22, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardLabel:        { fontSize: 11, fontWeight: '700', color: '#1A73E8', letterSpacing: 1, marginBottom: 6 },
  cardTitle:        { fontSize: 18, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 4 },
  cardSub:          { fontSize: 14, color: '#666', marginBottom: 20 },
  highlight:        { fontWeight: 'bold', color: '#1A73E8' },
  btnRow:           { flexDirection: 'row', gap: 12 },
  btnYes:           { flex: 1, backgroundColor: '#1A73E8', borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  btnNo:            { flex: 1, backgroundColor: '#FF5252', borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  btnIcon:          { fontSize: 22 },
  btnText:          { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  confirmedBox:     { alignItems: 'center', paddingVertical: 8 },
  confirmedText:    { fontSize: 17, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 6 },
  confirmedSub:     { fontSize: 13, color: '#666', marginBottom: 14, textAlign: 'center' },
  changeLink:       { color: '#1A73E8', fontSize: 14, textDecorationLine: 'underline' },

  communityCard:    { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  communityHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0' },
  communityTitle:   { fontSize: 15, fontWeight: 'bold', color: '#1A1A2E' },
  countPill:        { backgroundColor: '#E8F0FE', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  countText:        { fontSize: 12, color: '#1A73E8', fontWeight: '600' },
  communityNote:    { fontSize: 12, color: '#999', paddingHorizontal: 16, paddingVertical: 8, fontStyle: 'italic' },
  memberItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  avatar:           { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText:       { fontSize: 14, fontWeight: 'bold' },
  memberInfo:       { flex: 1 },
  memberName:       { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  memberTime:       { fontSize: 12, color: '#999', marginTop: 2 },
  badgeGoing:       { backgroundColor: '#E6F4EA', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGoingText:   { fontSize: 11, color: '#188038', fontWeight: '600' },
  badgeOut:         { backgroundColor: '#F1F3F4', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOutText:     { fontSize: 11, color: '#666' },
  badgePending:     { backgroundColor: '#FEF0E0', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  badgePendingText: { fontSize: 11, color: '#E37400', fontWeight: '600' },
  emptyText:        { padding: 20, textAlign: 'center', color: '#999' },

  placeholder:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' },
  phIcon:       { fontSize: 48, marginBottom: 12 },
  phTitle:      { fontSize: 20, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 6 },
  phSub:        { fontSize: 14, color: '#999' },
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
    paddingBottom: 10,
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: '#888',
    marginTop: 3,
  },
  labelActive: {
    color: '#1A73E8',
    fontWeight: '600',
  },
  sosWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  sosCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
    marginBottom: 4,
    shadowColor: '#E53935',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  sosLabel: {
    fontSize: 11,
    color: '#E53935',
    fontWeight: '700',
  },
});