import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { logOut, resetPassword } from '../firebase/authHelpers';
import { getUserDoc } from '../firebase/firestoreHelpers';
import { BUS_ROUTES } from './busRouteData';

type SearchHistoryEntry = {
  destination: string;
  timestamp: number;
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [starredRouteIds, setStarredRouteIds] = useState<number[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);

  useEffect(() => {
    if (!user) { router.back(); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [userDoc, rawStarred, rawHistory] = await Promise.all([
        getUserDoc(user!.uid),
        AsyncStorage.getItem('starredRouteIds'),
        AsyncStorage.getItem('searchHistory'),
      ]);
      setDisplayName((userDoc as any)?.username || user?.displayName || 'User');
      setStarredRouteIds(rawStarred ? JSON.parse(rawStarred) : []);
      setSearchHistory(rawHistory ? JSON.parse(rawHistory) : []);
    } catch {}
    setLoading(false);
  };

  const handleUnstar = async (routeId: number) => {
    const updated = starredRouteIds.filter((id) => id !== routeId);
    setStarredRouteIds(updated);
    await AsyncStorage.setItem('starredRouteIds', JSON.stringify(updated));
  };

  const handleClearHistory = async () => {
    Alert.alert('Clear History', 'Remove all search history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          setSearchHistory([]);
          await AsyncStorage.removeItem('searchHistory');
        },
      },
    ]);
  };

  const handleRemoveHistoryEntry = async (timestamp: number) => {
    const updated = searchHistory.filter((h) => h.timestamp !== timestamp);
    setSearchHistory(updated);
    await AsyncStorage.setItem('searchHistory', JSON.stringify(updated));
  };

  const handleLogout = async () => {
    await logOut();
    router.replace('/(tabs)' as any);
  };

  const handleResetPassword = () => {
    Alert.alert('Reset Password', 'Send a password reset link to your email?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', onPress: async () => {
          try {
            await resetPassword(displayName);
            Alert.alert('Sent', 'Check your email for the reset link.');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFC753" />
      </View>
    );
  }

  const initials = displayName.slice(0, 2).toUpperCase();
  const starredRoutes = starredRouteIds
    .map((id) => BUS_ROUTES.find((r) => r.id === id))
    .filter(Boolean) as typeof BUS_ROUTES;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Favorited Routes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Favorited Routes</Text>
          {starredRoutes.length > 0 ? (
            starredRoutes.map((route) => (
              <View key={route.id} style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: route.color }]} />
                <Text style={styles.routeName}>{route.name}</Text>
                <Pressable
                  onPress={() => handleUnstar(route.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.starActive}>★</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No favorited routes yet. Tap ★ on a route option to save it here.
            </Text>
          )}
        </View>

        {/* Search History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Search History</Text>
            {searchHistory.length > 0 && (
              <Pressable onPress={handleClearHistory}>
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            )}
          </View>
          {searchHistory.length > 0 ? (
            searchHistory.map((entry) => (
              <View key={entry.timestamp} style={styles.historyRow}>
                <Text style={styles.historyIcon}>🔍</Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyDest} numberOfLines={1}>{entry.destination}</Text>
                  <Text style={styles.historyDate}>{formatDate(entry.timestamp)}</Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveHistoryEntry(entry.timestamp)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.removeBtn}>✕</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No recent searches.</Text>
          )}
        </View>

        {/* Account actions */}
        <View style={styles.accountSection}>
          <Pressable style={styles.accountBtn} onPress={handleResetPassword}>
            <Text style={styles.accountBtnText}>Reset Password</Text>
          </Pressable>
          <Pressable style={[styles.accountBtn, styles.logoutBtn]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: { fontSize: 20, color: '#111', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  scroll: { paddingHorizontal: 20, paddingTop: 28 },

  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFC753',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  username: { fontSize: 20, fontWeight: '700', color: '#111' },
  email: { fontSize: 14, color: '#999', marginTop: 3 },

  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  clearAll: { fontSize: 13, color: '#E53935', fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#aaa', fontStyle: 'italic', lineHeight: 21 },

  // Favorited routes
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  routeDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  routeName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#222' },
  starActive: { fontSize: 22, color: '#FDD023' },

  // Search history
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyIcon: { fontSize: 15 },
  historyInfo: { flex: 1 },
  historyDest: { fontSize: 15, fontWeight: '500', color: '#222' },
  historyDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
  removeBtn: { fontSize: 14, color: '#ccc', fontWeight: '600' },

  // Account
  accountSection: { gap: 10, marginBottom: 8 },
  accountBtn: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  accountBtnText: { fontSize: 15, fontWeight: '600', color: '#333' },
  logoutBtn: { backgroundColor: '#FEF2F2' },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#E53935' },
});
