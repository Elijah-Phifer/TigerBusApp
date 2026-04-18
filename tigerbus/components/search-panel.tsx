/**
 * SearchPanel — components/search-panel.tsx
 *
 * Navigation-first bottom drawer for the LSU TigerBus app.
 *
 * Collapsed: shows "Where do you wanna go?" bar (or active trip summary)
 * Expanded:  shows From/To inputs with Nominatim geocoding, then matched routes
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  PanResponder,
  Keyboard,
  KeyboardEvent,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { RouteOption } from '../utils/tripPlanner';
import { VehiclePosition, getVehicleInfoForBoardStop } from '../utils/liveVehicles';
import { BUS_ROUTES } from '../app/busRouteData';
import {
  FILTER_PRESETS,
  formatFilterHour,
  getScheduleLabel,
  routeRunsAtHour,
} from '../utils/routeSchedule';
 
export type NavPlace = {
  name: string;
  latitude: number;
  longitude: number;
};

export type FavoriteTrip = {
  id: string;          // == RouteOption.id, e.g. "direct-5"
  destination: NavPlace;
  origin: NavPlace | null;  // null = user GPS location
  routeIds: number[];
  estimatedMinutes: number;
};
 
type SearchPanelProps = {
  isOpen: boolean;
  slideAnim: Animated.Value;
  panelHeight: number;
  collapsedHeight: number;
  onOpen: () => void;
  onClose: () => void;
  showAllRoutes: boolean;
  onToggleAllRoutes: () => void;
  navDestination: NavPlace | null;
  navOrigin: NavPlace | null;        // null = use device GPS
  userCoords: { latitude: number; longitude: number } | null;
  onSetDestination: (place: NavPlace | null) => void;
  onSetOrigin: (place: NavPlace | null) => void;
  routeOptions: RouteOption[];       // computed trip options (direct + transfers)
  selectedOption: RouteOption | null;
  onSelectOption: (opt: RouteOption) => void; // toggle: tapping same option deselects
  routesLoading: boolean;            // true while fetching active routes
  onArrivalTimeChange: (time: Date | null) => void;
  favoriteTrips: FavoriteTrip[];
  onToggleFavoriteTrip: (trip: FavoriteTrip) => void;
  onFilteredRouteIdsChange: (ids: number[] | null) => void;
  vehiclePositions: VehiclePosition[];
};
 
const getInitials = (name: string) =>
  name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

// Baton Rouge / LSU service area bounding box
const LSU_VIEWBOX = '-91.25,30.35,-91.10,30.50';

async function fetchPlaces(query: string): Promise<NavPlace[]> {
  if (query.trim().length < 2) return [];
  try {
    const q = encodeURIComponent(query.trim());
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${q}&format=json&limit=7&addressdetails=0&dedupe=1` +
      `&viewbox=${LSU_VIEWBOX}&bounded=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TigerBusApp/1.0' } });
    const data: any[] = await res.json();
    return data.map((item) => {
      const parts = (item.display_name as string).split(', ');
      const name = parts.length > 1
        ? `${parts[0]}, ${parts[1]}`
        : parts[0];
      return {
        name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      };
    });
  } catch {
    return [];
  }
}
 
export default function SearchPanel({
  isOpen,
  slideAnim,
  panelHeight,
  collapsedHeight,
  onOpen,
  onClose,
  showAllRoutes,
  onToggleAllRoutes,
  navDestination,
  navOrigin,
  onSetDestination,
  onSetOrigin,
  routeOptions,
  selectedOption,
  onSelectOption,
  routesLoading,
  onArrivalTimeChange,
  favoriteTrips,
  onToggleFavoriteTrip,
  onFilteredRouteIdsChange,
  vehiclePositions,
}: SearchPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
 
  // Which input field is being edited right now
  const [editingField, setEditingField] = useState<'from' | 'to' | null>(null);
  const [toText, setToText] = useState('');
  const [fromText, setFromText] = useState('');
  const [geoResults, setGeoResults] = useState<NavPlace[]>([]);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [navStarted, setNavStarted] = useState(false);
 
  // Arrival time picker — time only
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingTime, setPendingTime] = useState<Date>(new Date());

  // Route time filter (only active when showAllRoutes && no trip)
  const [filterHour, setFilterHour] = useState<number | null>(null);
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [pendingFilterTime, setPendingFilterTime] = useState<Date>(new Date());

  const clearFilter = () => { setFilterHour(null); setFilterLabel(null); };
 
  const handleArrivalTimeChange = (selected: Date | null) => {
    setArrivalTime(selected);
    onArrivalTimeChange(selected);
  };

  const onFilteredRouteIdsChangeRef = useRef(onFilteredRouteIdsChange);
  onFilteredRouteIdsChangeRef.current = onFilteredRouteIdsChange;

  const routeListItems = useMemo(() => {
    if (filterHour === null) return BUS_ROUTES;
    return BUS_ROUTES.filter((r) => routeRunsAtHour(r.id, filterHour));
  }, [filterHour]);

  useEffect(() => {
    if (filterHour === null) {
      onFilteredRouteIdsChangeRef.current(null);
    } else {
      onFilteredRouteIdsChangeRef.current(routeListItems.map((r) => r.id));
    }
  }, [filterHour, routeListItems]);

  useEffect(() => {
    if (!showAllRoutes) clearFilter();
  }, [showAllRoutes]);

  useEffect(() => {
    if (!isOpen) setEditingField(null);
  }, [isOpen]);
 
  const formatArrivalTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
 
  const computeLeaveBy = (opt: RouteOption, arrival: Date): Date =>
    new Date(arrival.getTime() - opt.estimatedMinutes * 60 * 1000);
 
  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
 
  const toInputRef = useRef<TextInput | null>(null);
  const fromInputRef = useRef<TextInput | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
  // Sync local text when parent nav state changes
  useEffect(() => {
    setToText(navDestination?.name ?? '');
  }, [navDestination]);
 
  useEffect(() => {
    setFromText(navOrigin?.name ?? '');
  }, [navOrigin]);
 
  // Auto-focus 'To' input when panel opens in nav-input mode
  useEffect(() => {
    if (isOpen && editingField === 'to') {
      const t = setTimeout(() => toInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, editingField]);
 
  useEffect(() => {
    if (isOpen && editingField === 'from') {
      const t = setTimeout(() => fromInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, editingField]);
 
  // ─── Geocoding helpers ──────────────────────────
  const triggerGeoSearch = (text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setGeoResults([]); setIsLoadingGeo(false); return; }
    setIsLoadingGeo(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchPlaces(text);
      setGeoResults(results);
      setIsLoadingGeo(false);
    }, 350);
  };
 
  const handleToTextChange = (text: string) => {
    setToText(text);
    if (navDestination) onSetDestination(null); // clear confirmed dest on edit
    if (text.length > 0 && filterHour !== null) clearFilter();
    triggerGeoSearch(text);
  };
 
  const handleFromTextChange = (text: string) => {
    setFromText(text);
    if (navOrigin) onSetOrigin(null);
    triggerGeoSearch(text);
  };
 
  const saveSearchHistory = async (destination: string) => {
    try {
      const raw = await AsyncStorage.getItem('searchHistory');
      const history: { destination: string; timestamp: number }[] = raw ? JSON.parse(raw) : [];
      const deduped = history.filter((h) => h.destination !== destination);
      const updated = [{ destination, timestamp: Date.now() }, ...deduped].slice(0, 20);
      await AsyncStorage.setItem('searchHistory', JSON.stringify(updated));
    } catch {}
  };

  const handleSelectPlace = (place: NavPlace) => {
    setGeoResults([]);
    Keyboard.dismiss();
    if (editingField === 'to') {
      setToText(place.name);
      setEditingField(null);
      onSetDestination(place);
      saveSearchHistory(place.name);
      onClose();
    } else if (editingField === 'from') {
      setFromText(place.name);
      setEditingField(null);
      onSetOrigin(place);
      if (!navDestination) setEditingField('to');
    }
  };
 
  const handleClearTrip = () => {
    setToText('');
    setFromText('');
    setGeoResults([]);
    setEditingField(null);
    onSetDestination(null);
    onSetOrigin(null);
    Keyboard.dismiss();
  };
 
  // ─── Keyboard avoidance ─────────────────────────
  const panelBottom = useRef(new Animated.Value(0)).current;
 
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
 
    const onShow = (e: KeyboardEvent) => {
      Animated.timing(panelBottom, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e: KeyboardEvent) => {
      Animated.timing(panelBottom, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: false,
      }).start();
    };
 
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => { showSub.remove(); hideSub.remove(); };
  }, [panelBottom]);
 
  // ─── PanResponder ───────────────────────────────
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dragStartProgressRef = useRef(isOpen ? 1 : 0);
  const travelDistance = panelHeight - collapsedHeight;
 
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderGrant: () => {
        slideAnim.stopAnimation((value: number) => {
          dragStartProgressRef.current = value;
        });
      },
      onPanResponderMove: (_, gs) => {
        const next = dragStartProgressRef.current - gs.dy / travelDistance;
        slideAnim.setValue(Math.max(0, Math.min(1, next)));
      },
      onPanResponderRelease: (_, gs) => {
        slideAnim.stopAnimation((value: number) => {
          if (gs.vy < -0.25 || value > 0.5) {
            onOpenRef.current();
          } else {
            onCloseRef.current();
          }
        });
      },
    })
  ).current;
 
  // ─── Derived UI state ───────────────────────────
  const hasTrip = !!navDestination;
  const isEditing = editingField !== null;
 
  // ─── Render ─────────────────────────────────────
  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.panel,
        {
          bottom: panelBottom,
          height: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [collapsedHeight, panelHeight],
          }),
          borderTopLeftRadius: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [30, 24],
          }),
          borderTopRightRadius: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [30, 24],
          }),
        },
      ]}
    >
      {/* Drag handle */}
      <Animated.View
        style={[
          styles.handle,
          {
            backgroundColor: slideAnim.interpolate({
              inputRange: [0, 0.1, 1],
              outputRange: ['#000', '#868686', '#ccc'],
            }),
          },
        ]}
      />
 
      {/* ── Always-visible From / To card ── */}
      <View style={styles.headerWrap}>
        <View style={styles.fromToCard}>
 
          {/* From row */}
          <View style={styles.cardRow}>
            <View style={[styles.navDot, styles.navDotFrom]} />
            {editingField === 'from' ? (
              <TextInput
                ref={fromInputRef}
                style={styles.cardInput}
                value={fromText}
                onChangeText={handleFromTextChange}
                placeholder="From where?"
                placeholderTextColor="#aaa"
                returnKeyType="next"
                onSubmitEditing={() => {
                  setEditingField('to');
                  setTimeout(() => toInputRef.current?.focus(), 50);
                }}
                onBlur={() => { if (!fromText && !navOrigin) setEditingField(null); }}
              />
            ) : (
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  setFromText(navOrigin?.name ?? '');
                  setGeoResults([]);
                  setEditingField('from');
                  onOpen();
                }}
              >
                <Text style={[styles.cardLabel, !navOrigin && styles.cardLabelMuted]} numberOfLines={1}>
                  {navOrigin?.name ?? 'Your Location'}
                </Text>
              </Pressable>
            )}
            {navOrigin && editingField !== 'from' && (
              <Pressable onPress={() => { onSetOrigin(null); setFromText(''); }}>
                <Text style={styles.rowClear}>✕</Text>
              </Pressable>
            )}
            {hasTrip && editingField !== 'from' && !navOrigin && (
              <Pressable style={styles.clearTripBtn} onPress={handleClearTrip}>
                <Text style={styles.clearTripBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
 
          {/* Connector between rows */}
          <View style={styles.cardConnector}>
            <View style={styles.connectorLine} />
          </View>
 
          {/* To row */}
          <View style={styles.cardRow}>
            <View style={[styles.navDot, styles.navDotTo]} />
            <TextInput
              ref={toInputRef}
              style={styles.cardInput}
              value={toText}
              onChangeText={handleToTextChange}
              placeholder="Where to?"
              placeholderTextColor="#aaa"
              returnKeyType="search"
              onFocus={() => { setEditingField('to'); onOpen(); }}
              onBlur={() => { if (!toText && !navDestination) setEditingField(null); }}
            />
            {toText.length > 0 && (
              <Pressable onPress={() => {
                setToText('');
                setGeoResults([]);
                onSetDestination(null);
                setEditingField(null);
                Keyboard.dismiss();
              }}>
                <Text style={styles.rowClear}>✕</Text>
              </Pressable>
            )}
          </View>
 
        </View>
      </View>
 
      {/* ── Arrival time row ── */}
      <Animated.View
        style={[
          styles.arrivalRowWrap,
          {
            opacity: slideAnim.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0, 0, 1],
            }),
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <View style={styles.arrivalRow}>
          <Text style={styles.arrivalLabel}>Arrive by</Text>
          <Pressable
            style={[styles.arrivalPill, arrivalTime && styles.arrivalPillSet]}
            onPress={() => {
              setPendingTime(arrivalTime ?? new Date());
              setShowPicker(true);
            }}
          >
            <Text style={[styles.arrivalPillText, arrivalTime && styles.arrivalPillTextSet]}>
              {arrivalTime ? formatArrivalTime(arrivalTime) : 'Set time'}
            </Text>
          </Pressable>
          {arrivalTime && (
            <Pressable onPress={() => handleArrivalTimeChange(null)}>
              <Text style={styles.arrivalClear}>✕</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
 
      {/* ── Time picker ── */}
      {Platform.OS === 'android' ? (
        // Android: native clock dialog — onChange fires once with the chosen time or dismissed
        showPicker && (
          <DateTimePicker
            value={pendingTime}
            mode="time"
            display="clock"
            onChange={(event, d) => {
              setShowPicker(false);
              if (event.type === 'set' && d) {
                handleArrivalTimeChange(d);
              }
            }}
          />
        )
      ) : (
        // iOS: custom modal with spinner — backdrop dismisses, Confirm commits
        <Modal
          visible={showPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPicker(false)}
        >
          <View style={styles.pickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPicker(false)} />
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Arrive by</Text>
              <DateTimePicker
                value={pendingTime}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={(_, d) => { if (d) setPendingTime(d); }}
              />
              <Pressable
                style={styles.pickerNext}
                onPress={() => {
                  handleArrivalTimeChange(pendingTime);
                  setShowPicker(false);
                }}
              >
                <Text style={styles.pickerNextText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
 
      {/* ── Filter time picker ── */}
      {Platform.OS === 'android' ? (
        showFilterPicker && (
          <DateTimePicker
            value={pendingFilterTime}
            mode="time"
            display="clock"
            onChange={(event, d) => {
              setShowFilterPicker(false);
              if (event.type === 'set' && d) {
                setFilterHour(d.getHours());
                setFilterLabel('Custom');
              }
            }}
          />
        )
      ) : (
        <Modal
          visible={showFilterPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFilterPicker(false)}
        >
          <View style={styles.pickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFilterPicker(false)} />
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Filter by time</Text>
              <DateTimePicker
                value={pendingFilterTime}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={(_, d) => { if (d) setPendingFilterTime(d); }}
              />
              <Pressable
                style={styles.pickerNext}
                onPress={() => {
                  setFilterHour(pendingFilterTime.getHours());
                  setFilterLabel('Custom');
                  setShowFilterPicker(false);
                }}
              >
                <Text style={styles.pickerNextText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Expanded content ── */}
      <Animated.View
        style={[
          styles.expandedContent,
          {
            opacity: slideAnim.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0, 0, 1],
            }),
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <ScrollView
          style={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isLoadingGeo ? (
            <ActivityIndicator color="#1565C0" style={{ marginTop: 20 }} />
          ) : geoResults.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Suggestions</Text>
              {geoResults.map((place, i) => (
                <Pressable
                  key={i}
                  style={styles.geoResultItem}
                  onPress={() => handleSelectPlace(place)}
                >
                  <Text style={styles.geoResultIcon}>📍</Text>
                  <Text style={styles.geoResultName} numberOfLines={2}>
                    {place.name}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : hasTrip && !isEditing ? (
            routesLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#1565C0" />
                <Text style={styles.loadingText}>Finding active buses…</Text>
              </View>
            ) : routeOptions.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>
                  {routeOptions.length} option{routeOptions.length !== 1 ? 's' : ''} · fastest first
                  {arrivalTime ? ` · arrive by ${formatArrivalTime(arrivalTime)}` : ''}
                </Text>
                {routeOptions.map((opt) => {
                  const isSelected = selectedOption?.id === opt.id;
                  const leaveBy = arrivalTime ? computeLeaveBy(opt, arrivalTime) : null;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                      onPress={() => onSelectOption(opt)}
                    >
                      {/* Route color bars */}
                      <View style={styles.optionBars}>
                        {opt.routes.map((r) => (
                          <View key={r.id} style={[styles.optionColorBar, { backgroundColor: r.color }]} />
                        ))}
                      </View>
 
                      {/* Option details */}
                      <View style={styles.optionDetails}>
                        {opt.type === 'direct' ? (
                          <Text style={styles.optionInstruction} numberOfLines={2}>
                            Walk {Math.ceil(opt.walkToBoard / 80)}min → {opt.routes[0].name} → Walk {Math.ceil(opt.walkFromAlight / 80)}min
                          </Text>
                        ) : (
                          <Text style={styles.optionInstruction} numberOfLines={2}>
                            Walk {Math.ceil(opt.walkToBoard / 80)}min → {opt.routes[0].name} → {opt.routes[1].name} → Walk {Math.ceil(opt.walkFromAlight / 80)}min
                          </Text>
                        )}
 
                        {opt.type === 'direct' ? (
                          <>
                            <Text style={styles.optionStopLine} numberOfLines={1}>
                              Board: {opt.boardStop.name}
                            </Text>
                            <Text style={styles.optionStopLine} numberOfLines={1}>
                              Get off: {opt.alightStop.name}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.optionStopLine} numberOfLines={1}>
                              Board: {opt.boardStop.name}
                            </Text>
                            <Text style={styles.optionTransferLine} numberOfLines={1}>
                              Transfer at: {opt.transferStop?.name}
                            </Text>
                            <Text style={styles.optionStopLine} numberOfLines={1}>
                              Get off: {opt.alightStop.name}
                            </Text>
                          </>
                        )}
                      </View>
 
                      {/* Badges */}
                      <View style={styles.optionBadgeWrap}>
                        {/* Estimated total time — primary ranking signal */}
                        <View style={styles.estTimeBadge}>
                          <Text style={styles.estTimeText}>~{opt.estimatedMinutes} min</Text>
                        </View>
<View style={[styles.optionBadge, { backgroundColor: opt.type === 'direct' ? '#e8f5e9' : '#fff8e1' }]}>
                          <Text style={[styles.optionBadgeText, { color: opt.type === 'direct' ? '#2e7d32' : '#f57f17' }]}>
                            {opt.type === 'direct' ? 'Direct' : '1 Transfer'}
                          </Text>
                        </View>
                        {leaveBy && (
                          <View style={styles.leaveByBadge}>
                            <Text style={styles.leaveByLabel}>Leave by</Text>
                            <Text style={styles.leaveByTime}>{formatTime(leaveBy)}</Text>
                          </View>
                        )}
                        {opt.nextBusSeconds !== undefined && !leaveBy && (
                          <View style={styles.nextBusBadge}>
                            <Text style={styles.nextBusBadgeText}>
                              Next:{' '}
                              {opt.nextBusSeconds < 60
                                ? `${opt.nextBusSeconds}s`
                                : `${Math.ceil(opt.nextBusSeconds / 60)}min`}
                            </Text>
                          </View>
                        )}
                        {isSelected && (() => {
                          const info = getVehicleInfoForBoardStop(
                            vehiclePositions, opt.routes[0].id, opt.boardStop,
                          );
                          return (
                            <>
                              <Text style={styles.optionShowingTag}>Showing on map</Text>
                              {info && (
                                <View style={styles.busInfoRow}>
                                  <View style={[styles.capacityBadge, { backgroundColor: info.capacityBg }]}>
                                    <Text style={[styles.capacityText, { color: info.capacityFg }]}>
                                      {info.capacityText}
                                    </Text>
                                  </View>
                                  <View style={styles.etaBadge}>
                                    <Text style={styles.etaLabel}>Bus arriving</Text>
                                    <Text style={styles.etaValue}>~{info.etaMinutes} min</Text>
                                  </View>
                                </View>
                              )}
                              <Pressable
                                style={styles.letsGoBtn}
                                onPress={() => setNavStarted(true)}
                              >
                                <Text style={styles.letsGoBtnText}>Let's Go →</Text>
                              </Pressable>
                            </>
                          );
                        })()}
                      </View>
 
                      {/* Star button — saves full trip to home screen */}
                      <Pressable
                        style={styles.starBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          if (!navDestination) return;
                          onToggleFavoriteTrip({
                            id: opt.id,
                            destination: navDestination,
                            origin: navOrigin,
                            routeIds: opt.routes.map((r) => r.id),
                            estimatedMinutes: opt.estimatedMinutes,
                          });
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={[
                          styles.starIcon,
                          favoriteTrips.some((f) => f.id === opt.id && f.destination.name === navDestination?.name) && styles.starIconActive,
                        ]}>
                          ★
                        </Text>
                      </Pressable>
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <View style={styles.noRoutesBox}>
                <Text style={styles.noRoutesIcon}>🚌</Text>
                <Text style={styles.noRoutesTitle}>No routes found</Text>
                <Text style={styles.noRoutesSubtitle}>
                  No Tiger Trails stop is close enough to both locations. Try a nearby street or landmark.
                </Text>
              </View>
            )
          ) : !isEditing ? (
            showAllRoutes ? (
              <>
                {/* Time filter chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterChipsScroll}
                  contentContainerStyle={styles.filterChipsContent}
                >
                  {FILTER_PRESETS.map((preset) => {
                    const isActive = filterLabel === preset.label;
                    return (
                      <Pressable
                        key={preset.label}
                        style={[styles.filterChip, isActive && styles.filterChipActive]}
                        onPress={() => {
                          const hour = preset.hour !== null ? preset.hour : new Date().getHours();
                          setFilterHour(hour);
                          setFilterLabel(preset.label);
                        }}
                      >
                        <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.filterChip, filterLabel === 'Custom' && styles.filterChipActive]}
                    onPress={() => {
                      const d = new Date();
                      if (filterHour !== null) d.setHours(filterHour, 0, 0, 0);
                      setPendingFilterTime(d);
                      setShowFilterPicker(true);
                    }}
                  >
                    <Text style={[styles.filterChipText, filterLabel === 'Custom' && styles.filterChipTextActive]}>
                      {filterLabel === 'Custom' && filterHour !== null
                        ? formatFilterHour(filterHour)
                        : 'Custom…'}
                    </Text>
                  </Pressable>
                  {filterHour !== null && (
                    <Pressable style={styles.filterClearChip} onPress={clearFilter}>
                      <Text style={styles.filterClearText}>✕ Clear</Text>
                    </Pressable>
                  )}
                </ScrollView>

                {/* Route list */}
                <Text style={styles.sectionLabel}>
                  {filterHour !== null
                    ? `${routeListItems.length} route${routeListItems.length !== 1 ? 's' : ''} at ${filterLabel === 'Custom' ? formatFilterHour(filterHour) : filterLabel}`
                    : `All ${routeListItems.length} routes`}
                </Text>
                {routeListItems.map((route) => (
                  <View key={route.id} style={styles.routeListItem}>
                    <View style={[styles.routeListDot, { backgroundColor: route.color }]} />
                    <Text style={styles.routeListName} numberOfLines={1}>{route.name}</Text>
                    <Text style={styles.routeListHours}>{getScheduleLabel(route.id)}</Text>
                  </View>
                ))}
                {filterHour !== null && routeListItems.length === 0 && (
                  <View style={styles.noRoutesBox}>
                    <Text style={styles.noRoutesIcon}>🌙</Text>
                    <Text style={styles.noRoutesTitle}>No routes at this time</Text>
                    <Text style={styles.noRoutesSubtitle}>Try a different time or clear the filter.</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.hintBox}>
                <Text style={styles.hintIcon}>🐯</Text>
                <Text style={styles.hintText}>
                  Type a destination to find which Tiger Trails routes can get you there.
                </Text>
              </View>
            )
          ) : null}
        </ScrollView>
 
        {/* Bottom bar: avatar + routes toggle */}
        <View style={styles.bottomRow}>
          <Pressable
            style={styles.userPill}
            onPress={() => router.push(user ? ('/profile' as any) : ('/login' as any))}
          >
            {user ? (
              <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>
                  {getInitials(user.displayName || user.email || 'U')}
                </Text>
              </View>
            ) : (
              <Text style={styles.loginText}>Log In</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.routesBtnSm, showAllRoutes && styles.routesBtnActive]}
            onPress={onToggleAllRoutes}
          >
            <Text style={[styles.routesBtnText, showAllRoutes && styles.routesBtnTextActive]}>
              {showAllRoutes ? 'Hide Routes' : 'Show All Routes'}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
 
      {/* ── Turn-by-turn nav modal ── */}
      {navStarted && selectedOption && (
        <Modal transparent animationType="slide">
          <View style={styles.navModalBackdrop}>
            <View style={styles.navModal}>
              <Text style={styles.navModalTitle}>Your Trip</Text>
 
              <View style={styles.navStep}>
                <Text style={styles.navStepIcon}>🚶</Text>
                <Text style={styles.navStepText}>
                  Walk {Math.ceil(selectedOption.walkToBoard / 80)} min to{' '}
                  <Text style={styles.navStepBold}>{selectedOption.boardStop.name}</Text>
                </Text>
              </View>
 
              <View style={styles.navDivider} />
 
              <View style={styles.navStep}>
                <Text style={styles.navStepIcon}>🚌</Text>
                <Text style={styles.navStepText}>
                  Board{' '}
                  <Text style={styles.navStepBold}>{selectedOption.routes[0].name}</Text>
                  {selectedOption.nextBusSeconds !== undefined && (
                    <Text style={styles.navStepMuted}>
                      {' '}(next bus in {Math.ceil(selectedOption.nextBusSeconds / 60)} min)
                    </Text>
                  )}
                </Text>
              </View>
 
              <View style={styles.navDivider} />
 
              {selectedOption.type === 'transfer' && selectedOption.transferStop && (
                <>
                  <View style={styles.navStep}>
                    <Text style={styles.navStepIcon}>🔄</Text>
                    <Text style={styles.navStepText}>
                      Transfer at{' '}
                      <Text style={styles.navStepBold}>{selectedOption.transferStop.name}</Text>
                      {' '}to{' '}
                      <Text style={styles.navStepBold}>{selectedOption.routes[1].name}</Text>
                    </Text>
                  </View>
                  <View style={styles.navDivider} />
                </>
              )}
 
              <View style={styles.navStep}>
                <Text style={styles.navStepIcon}>📍</Text>
                <Text style={styles.navStepText}>
                  Get off at{' '}
                  <Text style={styles.navStepBold}>{selectedOption.alightStop.name}</Text>
                </Text>
              </View>
 
              <View style={styles.navDivider} />
 
              <View style={styles.navStep}>
                <Text style={styles.navStepIcon}>🚶</Text>
                <Text style={styles.navStepText}>
                  Walk {Math.ceil(selectedOption.walkFromAlight / 80)} min to your destination
                </Text>
              </View>
 
              <Pressable
                style={styles.navCloseBtn}
                onPress={() => setNavStarted(false)}
              >
                <Text style={styles.navCloseBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </Animated.View>
  );
}
 
const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    overflow: 'hidden',
    zIndex: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
    marginBottom: 10,
  },
 
  // ── Header (always visible) ────────────────────
  headerWrap: {
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  fromToCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  cardConnector: {
    marginVertical: -2,
  },
  connectorLine: {
    width: 2,
    height: 10,
    backgroundColor: '#ccc',
    borderRadius: 1,
    marginLeft: 4,
  },
  cardInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    fontWeight: '600',
    paddingVertical: 0,
  },
  cardLabel: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
  },
  cardLabelMuted: {
    color: '#999',
    fontWeight: '500',
  },
  rowClear: {
    fontSize: 14,
    color: '#bbb',
    paddingHorizontal: 4,
    fontWeight: '600',
  },
  clearTripBtn: {
    padding: 4,
  },
  clearTripBtnText: {
    fontSize: 14,
    color: '#bbb',
    fontWeight: '600',
  },
 
  // ── Nav dots ───────────────────────────────────
  navDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    flexShrink: 0,
  },
  navDotFrom: {
    backgroundColor: '#4CAF50',
    borderColor: '#388E3C',
  },
  navDotTo: {
    backgroundColor: '#F44336',
    borderColor: '#C62828',
  },
 
  // ── Expanded content ───────────────────────────
  expandedContent: {
    flex: 1,
    paddingHorizontal: 14,
  },
  resultsList: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
 
  // Geocoding results
  geoResultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  geoResultIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  geoResultName: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
    lineHeight: 20,
  },
 
  // Route option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    paddingRight: 36,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    borderWidth: 1.5,
    borderColor: '#ebebeb',
    position: 'relative',
  },
  optionCardSelected: {
    backgroundColor: '#f0f4ff',
    borderColor: '#1565C0',
  },
  optionBars: {
    flexDirection: 'column',
    gap: 2,
    paddingTop: 2,
  },
  optionColorBar: {
    width: 5,
    height: 28,
    borderRadius: 3,
  },
  optionDetails: {
    flex: 1,
    gap: 2,
  },
  optionRouteName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  optionStopLine: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  optionTransferLine: {
    fontSize: 12,
    color: '#f57f17',
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 2,
  },
  optionBadgeWrap: {
    alignItems: 'flex-end',
    gap: 4,
  },
  estTimeBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  estTimeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
optionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  optionShowingTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1565C0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionInstruction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
    lineHeight: 17,
  },
  nextBusBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  nextBusBadgeText: {
    fontSize: 10,
    color: '#1565C0',
    fontWeight: '700',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
 
  // ── Arrival time row ───────────────────────────
  arrivalRowWrap: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  arrivalLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  arrivalPill: {
    flex: 1,
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  arrivalPillSet: {
    backgroundColor: '#1565C0',
  },
  arrivalPillText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
    textAlign: 'center',
  },
  arrivalPillTextSet: {
    color: '#fff',
  },
  arrivalClear: {
    fontSize: 14,
    color: '#bbb',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
 
  // ── Date/time picker modal ─────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerNext: {
    marginTop: 16,
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerNextText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
 
  // ── Star button ────────────────────────────────
  starBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
  starIcon: {
    fontSize: 20,
    color: '#ddd',
  },
  starIconActive: {
    color: '#FDD023',
  },
 
  // ── Leave-by badge ─────────────────────────────
  leaveByBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    marginTop: 2,
  },
  leaveByLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E65100',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaveByTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E65100',
  },
 
  // No routes / hint boxes
  noRoutesBox: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  noRoutesIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  noRoutesTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  noRoutesSubtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    lineHeight: 20,
  },
  hintBox: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  hintIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  hintText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 21,
  },
 
  // ── Bottom bar ─────────────────────────────────
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  userPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  initialsCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f19539',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  loginText: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '600',
  },
  routesBtnSm: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#ddd',
  },
  routesBtnActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  routesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    lineHeight: 15,
  },
  routesBtnTextActive: {
    color: '#fff',
  },
 
  // ── Bus ETA / capacity (selected card) ────────
  busInfoRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    alignItems: 'center',
  },
  capacityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  capacityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  etaBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  etaLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  etaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111',
  },

  // ── Let's Go button ────────────────────────────
  letsGoBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    alignItems: 'center',
  },
  letsGoBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
 
  // ── Route filter chips ─────────────────────────
  filterChipsScroll: {
    marginBottom: 6,
  },
  filterChipsContent: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterClearChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  filterClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E53935',
  },

  // ── Route list ─────────────────────────────────
  routeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  routeListDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    flexShrink: 0,
  },
  routeListName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  routeListHours: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },

  // ── Nav modal ──────────────────────────────────
  navModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  navModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  navModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    marginBottom: 20,
  },
  navStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  navStepIcon: {
    fontSize: 22,
  },
  navStepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  navStepBold: {
    fontWeight: '700',
    color: '#111',
  },
  navStepMuted: {
    color: '#888',
    fontWeight: '400',
  },
  navDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 34,
  },
  navCloseBtn: {
    marginTop: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  navCloseBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
});
 
