import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
  Share,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { logOut, resetPassword } from '../firebase/authHelpers';
import {
  getUserDoc,
  getCheckinsByUser,
  getSavedPlaces,
  unsavePlace,
  updateCheckinFeedback,
  postExists,
  onPostsSnapshot,
} from '../firebase/firestoreHelpers';

const PIE_COLORS = ['#8AA6A3', '#F4A261', '#E76F51', '#2A9D8F', '#264653', '#E9C46A', '#A8DADC', '#457B9D'];
const FEEDBACK_TOGGLE_KEY = 'tigerbus_feedback_enabled';

// ─── SVG Icons ──────────────────────────────────────
function BookmarkIcon({ size = 18, color = '#111' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4a2 2 0 012-2h10a2 2 0 012 2v18l-7-4-7 4V4z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function GearIcon({ size = 18, color = '#111' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronLeftIcon({ size = 20, color = '#111' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShareIcon({ size = 16, color = '#111' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Donut Chart Component ──────────────────────────
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const start = {
    x: cx + r * Math.cos(toRad(startAngle)),
    y: cy + r * Math.sin(toRad(startAngle)),
  };
  const end = {
    x: cx + r * Math.cos(toRad(endAngle)),
    y: cy + r * Math.sin(toRad(endAngle)),
  };
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function DonutChart({
  data,
  size = 220,
  strokeWidth = 34,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const gapDeg = data.length > 1 ? 1.5 : 0;

  let currentAngle = -90; // start from top
  const arcs = data.map((d) => {
    const sweep = (d.value / total) * 360;
    const startAngle = currentAngle + gapDeg / 2;
    const endAngle = currentAngle + sweep - gapDeg / 2;
    currentAngle += sweep;
    return { ...d, startAngle, endAngle };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <SvgCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#f0f0f0"
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc, i) => (
          <Path
            key={i}
            d={describeArc(cx, cy, radius, arc.startAngle, arc.endAngle)}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      {/* Legend below chart */}
      <View style={donutStyles.legend}>
        {data.map((d, i) => (
          <View key={i} style={donutStyles.legendItem}>
            <View style={[donutStyles.legendDot, { backgroundColor: d.color }]} />
            <Text style={donutStyles.legendLabel}>{d.label}</Text>
            <Text style={donutStyles.legendValue}>{d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
    paddingHorizontal: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  legendValue: {
    fontSize: 13,
    color: '#999',
  },
});

// ─── Animated Dropdown Wrapper ──────────────────────
function AnimatedDropdown({ visible, children, style }: { visible: boolean; children: React.ReactNode; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
      });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        style,
        {
          opacity: anim,
          transform: [{
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-6, 0],
            }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Animated Enjoyment Section ─────────────────────
function EnjoymentSection({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={{
        opacity: anim,
        maxHeight: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 500],
        }),
        overflow: 'hidden',
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── Main Profile Screen ────────────────────────────
export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [userDoc, setUserDoc] = useState<any>(null);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);

  // Dropdowns
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  // Activity log
  const [activityExpanded, setActivityExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;


  // Feedback popup state
  const [unratedQueue, setUnratedQueue] = useState<any[]>([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<'enjoy' | 'reason'>('enjoy');

  useEffect(() => {
    if (!user) {
      router.back();
      return;
    }
    loadProfileData();
    loadSettings();

    // Real-time: remove saved places if their post gets deleted
    const unsubscribe = onPostsSnapshot((posts) => {
      const postIds = new Set(posts.map((p: any) => p.id));
      setSavedPlaces(prev => {
        const valid = prev.filter((sp: any) => postIds.has(sp.placeId));
        // Clean up stale from Firestore
        const stale = prev.filter((sp: any) => !postIds.has(sp.placeId));
        stale.forEach((sp: any) => unsavePlace(user.uid, sp.placeId));
        return valid;
      });
    });

    return () => unsubscribe();
  }, [user]);

  const loadSettings = async () => {
    try {
      const fbVal = await AsyncStorage.getItem(FEEDBACK_TOGGLE_KEY);
      if (fbVal !== null) setFeedbackEnabled(fbVal === 'true');
    } catch {}
  };

  const toggleFeedback = async () => {
    const newVal = !feedbackEnabled;
    setFeedbackEnabled(newVal);
    await AsyncStorage.setItem(FEEDBACK_TOGGLE_KEY, String(newVal));
  };

const loadProfileData = async () => {
    try {
      const [userData, userCheckins, userSaved] = await Promise.all([
        getUserDoc(user!.uid),
        getCheckinsByUser(user!.uid),
        getSavedPlaces(user!.uid),
      ]);
      setUserDoc(userData);
      setCheckins(userCheckins);

      // Filter out saved places whose posts have been deleted
      const validChecks = await Promise.all(
        userSaved.map(async (sp: any) => ({ ...sp, exists: await postExists(sp.placeId) }))
      );
      const validSaved = validChecks.filter((sp: any) => sp.exists);
      // Clean up stale ones from Firestore
      const stale = validChecks.filter((sp: any) => !sp.exists);
      stale.forEach((sp: any) => unsavePlace(user!.uid, sp.placeId));
      setSavedPlaces(validSaved);

      const unrated = userCheckins.filter((c: any) => c.enjoyed === undefined || c.enjoyed === null);
      if (unrated.length > 0) {
        setUnratedQueue(unrated);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && unratedQueue.length > 0 && feedbackEnabled) {
      setFeedbackStep('enjoy');
      setShowFeedbackModal(true);
    }
  }, [loading, unratedQueue, feedbackEnabled]);

  const currentFeedbackCheckin = unratedQueue[0];

  const handleFeedbackEnjoy = async (enjoyed: boolean) => {
    if (!currentFeedbackCheckin) return;
    if (enjoyed) {
      await updateCheckinFeedback(currentFeedbackCheckin.id, true);
      setCheckins(prev =>
        prev.map(c => c.id === currentFeedbackCheckin.id ? { ...c, enjoyed: true, notEnjoyedReason: null } : c)
      );
      advanceFeedbackQueue();
    } else {
      setFeedbackStep('reason');
    }
  };

  const handleFeedbackReason = async (reason: 'place' | 'skip') => {
    if (!currentFeedbackCheckin) return;
    await updateCheckinFeedback(currentFeedbackCheckin.id, false, reason);
    setCheckins(prev =>
      prev.map(c => c.id === currentFeedbackCheckin.id ? { ...c, enjoyed: false, notEnjoyedReason: reason } : c)
    );
    advanceFeedbackQueue();
  };

  const advanceFeedbackQueue = () => {
    const remaining = unratedQueue.slice(1);
    setUnratedQueue(remaining);
    if (remaining.length === 0) {
      setShowFeedbackModal(false);
    } else {
      setFeedbackStep('enjoy');
    }
  };

  const skipAllFeedback = () => {
    setUnratedQueue([]);
    setShowFeedbackModal(false);
  };

const enjoymentBreakdown = () => {
    const rated = checkins.filter((c: any) => c.enjoyed !== undefined && c.enjoyed !== null);
    if (rated.length === 0) return null;
    const enjoyed = rated.filter((c: any) => c.enjoyed === true).length;
    const notEnjoyed = rated.filter((c: any) => c.enjoyed === false).length;
    return { enjoyed, notEnjoyed, total: rated.length };
  };

  const calcWeeklyStreak = () => {
    if (checkins.length === 0) return 0;
    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const weeks = new Set<number>();
    checkins.forEach((c: any) => {
      const date = c.checkedInAt?.toDate ? c.checkedInAt.toDate() : new Date(c.checkedInAt);
      weeks.add(getWeekStart(date));
    });
    const sortedWeeks = Array.from(weeks).sort((a, b) => b - a);
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    let streak = 1;
    for (let i = 0; i < sortedWeeks.length - 1; i++) {
      if (sortedWeeks[i] - sortedWeeks[i + 1] === ONE_WEEK) streak++;
      else break;
    }
    const currentWeekStart = getWeekStart(new Date());
    if (sortedWeeks[0] !== currentWeekStart && sortedWeeks[0] !== currentWeekStart - ONE_WEEK) return 0;
    return streak;
  };

  const calcMonthlySummary = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return checkins.filter((c: any) => {
      const date = c.checkedInAt?.toDate ? c.checkedInAt.toDate() : new Date(c.checkedInAt);
      return date >= startOfMonth;
    }).length;
  };

  const handleLogout = async () => {
    await logOut();
    router.replace('/(tabs)' as any);
  };

  const handleResetPassword = () => {
    const username = userDoc?.username || user?.displayName;
    if (!username) {
      Alert.alert('Error', 'Could not determine username.');
      return;
    }
    Alert.alert('Reset Password', 'We will send a password reset email.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          try {
            await resetPassword(username);
            Alert.alert('Sent', 'Check your email for the reset link.');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleUnsave = async (placeId: string) => {
    if (!user) return;
    await unsavePlace(user.uid, placeId);
    setSavedPlaces(prev => prev.filter(p => p.placeId !== placeId));
  };

  const handleSharePlace = async (place: any) => {
    const name = place.placeName || 'a place';
    const lat = place.latitude || 0;
    const lng = place.longitude || 0;
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
    try {
      await Share.share({
        message: `Check out ${name} on TigerBus! \uD83D\uDCCD\n${mapsUrl}`,
      });
    } catch {}
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8AA6A3" />
      </View>
    );
  }

  const enjoyment = enjoymentBreakdown();
  const streak = calcWeeklyStreak();
  const monthlyCount = calcMonthlySummary();
  const displayName = userDoc?.username || user?.displayName || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const sortedCheckins = [...checkins].sort((a, b) => {
    const dateA = a.checkedInAt?.toDate ? a.checkedInAt.toDate() : new Date(a.checkedInAt || 0);
    const dateB = b.checkedInAt?.toDate ? b.checkedInAt.toDate() : new Date(b.checkedInAt || 0);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <View style={styles.container}>
      {/* Header — back arrow + title only */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronLeftIcon size={20} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Sub-header: bookmark (left) + gear (right) */}
      <View style={styles.subHeader}>
        <Pressable
          onPress={() => { setSavedOpen(!savedOpen); setSettingsOpen(false); }}
          style={[styles.subIconBtn, savedOpen && { backgroundColor: '#ff9800' }]}
        >
          <BookmarkIcon size={16} color={savedOpen ? '#fff' : '#111'} />
          <Text style={[styles.subIconLabel, savedOpen && styles.subIconLabelActive]}>
            Saved ({savedPlaces.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setSettingsOpen(!settingsOpen); setSavedOpen(false); }}
          style={[styles.subIconBtn, settingsOpen && { backgroundColor: '#ff9800' }]}
        >
          <GearIcon size={16} color={settingsOpen ? '#fff' : '#111'} />
          <Text style={[styles.subIconLabel, settingsOpen && styles.subIconLabelActive]}>
            Settings
          </Text>
        </Pressable>
      </View>

      {/* Settings Dropdown */}
      <AnimatedDropdown visible={settingsOpen} style={[styles.dropdown, styles.dropdownRight]}>
        <Pressable style={styles.dropdownItem} onPress={toggleFeedback}>
          <Text style={styles.dropdownItemText}>Activity Feedback</Text>
          <View style={[styles.toggleTrack, feedbackEnabled && styles.toggleTrackOn]}>
            <View style={[styles.toggleThumb, feedbackEnabled && styles.toggleThumbOn]} />
          </View>
        </Pressable>
        <Pressable style={styles.dropdownItem} onPress={() => { setSettingsOpen(false); handleResetPassword(); }}>
          <Text style={styles.dropdownItemText}>Reset Password</Text>
        </Pressable>
        <Pressable style={[styles.dropdownItem, { borderBottomWidth: 0 }]} onPress={() => { setSettingsOpen(false); handleLogout(); }}>
          <Text style={[styles.dropdownItemText, { color: '#E76F51' }]}>Log Out</Text>
        </Pressable>
      </AnimatedDropdown>

      {/* Saved Places Dropdown */}
      <AnimatedDropdown visible={savedOpen} style={[styles.dropdown, styles.dropdownLeft]}>
        <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
          {savedPlaces.length > 0 ? (
            savedPlaces.map((sp: any, idx: number) => {
              const name = sp.placeName || sp.placeId;
              return (
                <View key={sp.placeId} style={[styles.dropdownSavedItem, idx === savedPlaces.length - 1 && { borderBottomWidth: 0 }]}>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                      setSavedOpen(false);
                      router.push({
                        pathname: '/(tabs)' as any,
                        params: {
                          focusPlaceId: sp.placeId,
                          focusLat: String(sp.latitude || ''),
                          focusLng: String(sp.longitude || ''),
                        },
                      });
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{name}</Text>
                  </Pressable>
                  <Pressable style={{ padding: 4, marginRight: 8 }} onPress={() => handleSharePlace(sp)}>
                    <ShareIcon size={14} color="#8AA6A3" />
                  </Pressable>
                  <Pressable onPress={() => handleUnsave(sp.placeId)}>
                    <Text style={styles.dropdownRemove}>{'\u2715'}</Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={styles.dropdownEmpty}>No saved places yet.</Text>
          )}
        </ScrollView>
      </AnimatedDropdown>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => { setSettingsOpen(false); setSavedOpen(false); }}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{streak}</Text>
            <Text style={styles.statLabel}>Week Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{monthlyCount}</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{checkins.length}</Text>
            <Text style={styles.statLabel}>Total Visits</Text>
          </View>
        </View>

        {/* Enjoyment Donut Chart */}
        <EnjoymentSection visible={feedbackEnabled}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enjoyment</Text>
            {enjoyment ? (
              <>
                <DonutChart
                  data={[
                    { label: 'Enjoyed', value: enjoyment.enjoyed, color: '#34C759' },
                    { label: 'Not Enjoyed', value: enjoyment.notEnjoyed, color: '#E76F51' },
                  ]}
                  size={220}
                  strokeWidth={34}
                />
                <Text style={styles.enjoymentSummary}>
                  You enjoyed {Math.round((enjoyment.enjoyed / enjoyment.total) * 100)}% of your rated visits
                </Text>
              </>
            ) : (
              <Text style={styles.emptyText}>Rate your visits below to see your enjoyment chart!</Text>
            )}
          </View>
        </EnjoymentSection>

        {/* Activity Log */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          {sortedCheckins.length > 0 ? (
            <>
              {sortedCheckins.slice(0, 5).map((c: any) => {
                const feedbackLabel = c.enjoyed === true
                  ? 'Enjoyed'
                  : c.enjoyed === false
                    ? (c.notEnjoyedReason === 'place' ? 'Didn\'t like the place' : 'Not enjoyed')
                    : null;

                return (
                  <View key={c.id} style={styles.activityItem}>
                    <View style={styles.activityLeft}>
                      <Text style={styles.activityName}>{c.placeName}</Text>
                      <Text style={styles.activityDate}>{formatDate(c.checkedInAt)}</Text>
                    </View>
                    {feedbackLabel ? (
                      <View style={[styles.feedbackBadge, { backgroundColor: c.enjoyed ? '#E8F5E9' : '#FEF2F2' }]}>
                        <Text style={[styles.feedbackBadgeText, { color: c.enjoyed ? '#34C759' : '#E76F51' }]}>
                          {feedbackLabel}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.unratedText}>Unrated</Text>
                    )}
                  </View>
                );
              })}
              {sortedCheckins.length > 5 && (
                <>
                  <Animated.View style={{
                    overflow: 'hidden',
                    opacity: expandAnim,
                    maxHeight: expandAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max((sortedCheckins.length - 5) * 85, 1)],
                    }),
                  }}>
                    {sortedCheckins.slice(5).map((c: any) => {
                      const feedbackLabel = c.enjoyed === true
                        ? 'Enjoyed'
                        : c.enjoyed === false
                          ? (c.notEnjoyedReason === 'place' ? 'Didn\'t like the place'
                            : c.notEnjoyedReason === 'hobby' ? 'Didn\'t like the hobby'
                            : 'Not enjoyed')
                          : null;

                      return (
                        <View key={c.id} style={styles.activityItem}>
                          <View style={styles.activityLeft}>
                            <Text style={styles.activityName}>{c.placeName}</Text>
                            <Text style={styles.activityDate}>{formatDate(c.checkedInAt)}</Text>
                          </View>
                          {feedbackLabel ? (
                            <View style={[styles.feedbackBadge, { backgroundColor: c.enjoyed ? '#E8F5E9' : '#FEF2F2' }]}>
                              <Text style={[styles.feedbackBadgeText, { color: c.enjoyed ? '#34C759' : '#E76F51' }]}>
                                {feedbackLabel}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.unratedText}>Unrated</Text>
                          )}
                        </View>
                      );
                    })}
                  </Animated.View>
                  <Pressable
                    style={styles.seeMoreBtn}
                    onPress={() => {
                      const expanding = !activityExpanded;
                      Animated.timing(expandAnim, {
                        toValue: expanding ? 1 : 0,
                        duration: 400,
                        easing: expanding
                          ? Easing.out(Easing.cubic)
                          : Easing.in(Easing.cubic),
                        useNativeDriver: false,
                      }).start();
                      setActivityExpanded(expanding);
                    }}
                  >
                    <Text style={styles.seeMoreText}>
                      {activityExpanded ? 'See Less' : `See More (${sortedCheckins.length - 5} more)`}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>No visits yet. Go explore!</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Feedback Popup Modal */}
      {showFeedbackModal && currentFeedbackCheckin && feedbackEnabled && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackCounter}>
                {unratedQueue.length} unrated visit{unratedQueue.length > 1 ? 's' : ''}
              </Text>

              {feedbackStep === 'enjoy' ? (
                <>
                  <Text style={styles.feedbackQuestion}>Did you enjoy</Text>
                  <Text style={styles.feedbackPlace}>{currentFeedbackCheckin.placeName}?</Text>
                  <View style={styles.feedbackActions}>
                    <Pressable
                      style={[styles.feedbackBtn, styles.feedbackBtnYes]}
                      onPress={() => handleFeedbackEnjoy(true)}
                    >
                      <Text style={styles.feedbackBtnYesText}>Enjoyed</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.feedbackBtn, styles.feedbackBtnNo]}
                      onPress={() => handleFeedbackEnjoy(false)}
                    >
                      <Text style={styles.feedbackBtnNoText}>Not Really</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.feedbackQuestion}>What didn't you enjoy?</Text>
                  <Text style={styles.feedbackPlace}>{currentFeedbackCheckin.placeName}</Text>
                  <View style={styles.reasonActions}>
                    <Pressable style={styles.reasonBtn} onPress={() => handleFeedbackReason('place')}>
                      <Text style={styles.reasonBtnText}>The Place</Text>
                    </Pressable>
                    <Pressable style={[styles.reasonBtn, styles.reasonBtnSkip]} onPress={() => handleFeedbackReason('skip')}>
                      <Text style={styles.reasonBtnSkipText}>Skip</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <Pressable onPress={skipAllFeedback} style={styles.skipAllBtn}>
                <Text style={styles.skipAllText}>Skip All</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  // Sub-header
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  subIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  subIconBtnActive: {
    backgroundColor: '#111',
  },
  subIconLabel: {
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  subIconLabelActive: {
    color: '#fff',
  },

  // Dropdowns
  dropdown: {
    position: 'absolute',
    top: 165,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  dropdownRight: {
    right: 16,
    left: 100,
  },
  dropdownLeft: {
    left: 16,
    right: 100,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#111',
    fontWeight: '500',
  },
  dropdownSavedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  dropdownRemove: {
    fontSize: 14,
    color: '#E76F51',
    fontWeight: '600',
    paddingLeft: 12,
  },
  dropdownEmpty: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    padding: 18,
  },

  // Simple toggle
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: '#8AA6A3',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#8AA6A3',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  username: { fontSize: 22, fontWeight: '700', color: '#111' },
  email: { fontSize: 14, color: '#666', marginTop: 4 },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: '#f8f8f8', borderRadius: 16,
    padding: 20, marginBottom: 24, alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  statDivider: { width: 1, height: 32, backgroundColor: '#ddd' },

  // Sections
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  emptyText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  seeMoreBtn: {
    alignItems: 'center' as const,
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  seeMoreText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#8AA6A3',
  },

  // Enjoyment
  enjoymentSummary: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },

  // Activity log
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityLeft: { flex: 1, marginRight: 12 },
  activityName: { fontSize: 16, fontWeight: '600', color: '#111' },
  activityDate: { fontSize: 12, color: '#999', marginTop: 2 },
  feedbackBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  feedbackBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  unratedText: {
    fontSize: 12,
    color: '#bbb',
    fontStyle: 'italic',
  },

  // Feedback modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  feedbackCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  feedbackCounter: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  feedbackQuestion: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  feedbackPlace: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  feedbackActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  feedbackBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  feedbackBtnYes: { backgroundColor: '#34C759' },
  feedbackBtnYesText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  feedbackBtnNo: { backgroundColor: '#f0f0f0' },
  feedbackBtnNoText: { color: '#333', fontSize: 16, fontWeight: '600' },
  reasonActions: {
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  reasonBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
  },
  reasonBtnText: { color: '#E76F51', fontSize: 16, fontWeight: '600' },
  reasonBtnSkip: { backgroundColor: '#f0f0f0' },
  reasonBtnSkipText: { color: '#999', fontSize: 16, fontWeight: '500' },
  skipAllBtn: { marginTop: 16, paddingVertical: 8 },
  skipAllText: { color: '#999', fontSize: 14, fontWeight: '500' },
});
