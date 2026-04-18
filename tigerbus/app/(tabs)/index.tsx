/**
 * HomeScreen — app/(tabs)/index.tsx
 *
 * Module map:
 *   components/search-panel.tsx – bottom drawer with search + results
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Animated,
  Keyboard,
  Dimensions,
  Easing,
  Alert,
  Modal,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  PanResponder,
  FlatList,
} from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EmojiPicker from 'rn-emoji-keyboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import "../../global.css";
import { BUS_ROUTES } from '../busRouteData';
import { BUS_STOPS } from '../busStops';
import SearchPanel, { NavPlace, FavoriteTrip } from '../../components/search-panel';
import { isNearRoute } from '../../utils/routeMatching';
import { findRouteOptions, RouteOption, fetchWalkingPath, WalkingPaths } from '../../utils/tripPlanner';
import { fetchActiveRoutes } from '../../utils/transitSchedule';
import { fetchLiveVehicles, VehiclePosition } from '../../utils/liveVehicles';
import {
  getReactions, addCheckin, onPostsSnapshot,
  savePlace, unsavePlace, getSavedPlaces,
  addReaction, deleteReaction,
  deletePost, updatePost,
} from '../../firebase/firestoreHelpers';
import { useAuth } from '../../context/AuthContext';
import {
  foregroundCheckin,
  startBackgroundLocation,
  setBackgroundUserId,
} from '../../utils/checkinService';
import ActionSheet from '../ActionSheet';


const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.5;
const COLLAPSED_HEIGHT = 110;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { focusPlaceId, focusLat, focusLng } = useLocalSearchParams<{
    focusPlaceId?: string;
    focusLat?: string;
    focusLng?: string;
  }>();
  const mapRef = useRef<MapView | null>(null);

const [region, setRegion] = useState<Region | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [pinLocation, setPinLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [dbPosts, setDbPosts] = useState<any[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<any>(null);
  const [popupReactions, setPopupReactions] = useState<any[]>([]);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAllRoutes, setShowAllRoutes] = useState(true);
  const [favoriteTrips, setFavoriteTrips] = useState<FavoriteTrip[]>([]);
  const [navDestination, setNavDestination] = useState<NavPlace | null>(null);
  const [navOrigin, setNavOrigin] = useState<NavPlace | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<RouteOption | null>(null);
  const [walkingPaths, setWalkingPaths] = useState<WalkingPaths | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);
  const [filteredRouteIds, setFilteredRouteIds] = useState<number[] | null>(null);
  const [vehiclePositions, setVehiclePositions] = useState<VehiclePosition[]>([]);
  // Stable GPS coords — only set once on first location fix, not updated on map pan
  const userCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Option ID to auto-select after route options recompute (used when restoring a favorite)
  const pendingOptionIdRef = useRef<string | null>(null);
  const [pinDropCancelPressed, setPinDropCancelPressed] = useState(false);
  const [pinDropConfirmPressed, setPinDropConfirmPressed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const slideAnim = useRef(new Animated.Value(0)).current;
  const dragProgressAnim = useRef(new Animated.Value(0)).current;
  const popupAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const pinDropAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible

  const popupPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          // Only allow dragging down
          const progress = 1 - gs.dy / 400;
          popupAnim.setValue(Math.max(0, progress));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          // Dismiss
          Animated.timing(popupAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            setSelectedMarker(null);
            setEditing(false);
            setShowEmojiPicker(false);
          });
        } else {
          // Snap back
          Animated.timing(popupAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission denied');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});

      // Capture stable GPS coords once — used for routing, not map pan
      userCoordsRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

      const newRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };

      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 1000);
    })();
  }, []);

  // ─── Compute route options when trip changes ─────
  useEffect(() => {
    if (!navDestination) {
      setRouteOptions([]);
      setSelectedOption(null);
      setWalkingPaths(null);
      setRoutesLoading(false);
      return;
    }
    let cancelled = false;
    setRoutesLoading(true);
    setRouteOptions([]);
    setSelectedOption(null);
    setWalkingPaths(null);

    (async () => {
      // Skip live filtering if user is planning a future trip (> 15 min from now)
      const isFutureTrip = arrivalTime && (arrivalTime.getTime() - Date.now()) > 15 * 60 * 1000;
      const data = isFutureTrip ? null : await fetchActiveRoutes();
      if (cancelled) return;
      const origin = navOrigin ?? userCoordsRef.current ?? { latitude: 30.412, longitude: -91.18 };
      const opts = findRouteOptions(origin, navDestination, data ?? undefined);
      if (!cancelled) {
        setRouteOptions(opts);
        setRoutesLoading(false);
        if (pendingOptionIdRef.current) {
          const match = opts.find((o) => o.id === pendingOptionIdRef.current);
          if (match) setSelectedOption(match);
          pendingOptionIdRef.current = null;
        }
      }
    })();

    return () => { cancelled = true; };
  }, [navDestination, navOrigin, arrivalTime]);

  // ─── Fetch walking paths when an option is selected ──
  useEffect(() => {
    if (!selectedOption || !navDestination) {
      setWalkingPaths(null);
      return;
    }
    const origin = navOrigin ?? userCoordsRef.current ?? { latitude: 30.412, longitude: -91.18 };
    let cancelled = false;
    (async () => {
      const [toBoard, fromAlight] = await Promise.all([
        fetchWalkingPath(origin, selectedOption.boardStop),
        fetchWalkingPath(selectedOption.alightStop, navDestination),
      ]);
      if (!cancelled) setWalkingPaths({ toBoard, fromAlight });
    })();
    return () => { cancelled = true; };
  }, [selectedOption]);

  // ─── Auto Check-in (Tier 1 + 2 + 3) ────────────
  useEffect(() => {
    if (!user) return;

    // Tier 2: Foreground check-in on app open
    foregroundCheckin(user.uid);

    // Tier 1: Start background location monitoring
    setBackgroundUserId(user.uid);
    startBackgroundLocation().catch(() => {});

  }, [user]);

  // ─── Favorite trips persistence ───────────────
  useEffect(() => {
    AsyncStorage.getItem('favoriteTrips').then((val) => {
      if (val) setFavoriteTrips(JSON.parse(val));
    });
  }, []);

  const toggleFavoriteTrip = (trip: FavoriteTrip) => {
    setFavoriteTrips((prev) => {
      const exists = prev.some((f) => f.id === trip.id && f.destination.name === trip.destination.name);
      const next = exists
        ? prev.filter((f) => !(f.id === trip.id && f.destination.name === trip.destination.name))
        : [...prev, trip];
      AsyncStorage.setItem('favoriteTrips', JSON.stringify(next));
      return next;
    });
  };

  const handleRestoreFavorite = (fav: FavoriteTrip) => {
    pendingOptionIdRef.current = fav.id;
    setNavOrigin(fav.origin);
    setNavDestination(fav.destination);
    setSelectedOption(null);
    openPanel();
  };

  // ─── Live vehicle positions (poll every 15 s) ──
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const vehicles = await fetchLiveVehicles();
      if (!cancelled) setVehiclePositions(vehicles);
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // ─── Real-time posts listener ─────────────────
  useEffect(() => {
    const unsubscribe = onPostsSnapshot((posts) => {
      setDbPosts(posts);
    });
    return () => unsubscribe();
  }, []);

  // Handle focus from profile saved places
  useEffect(() => {
    if (!focusPlaceId || !focusLat || !focusLng) return;
    const lat = parseFloat(focusLat);
    const lng = parseFloat(focusLng);
    if (isNaN(lat) || isNaN(lng)) return;

    const targetRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    mapRef.current?.animateToRegion(targetRegion, 700);

    // Find the post and open popup
    const found = dbPosts.find((p: any) => p.id === focusPlaceId);
    if (found) handleMarkerPress({
      id: found.id, name: found.title, description: found.description,
      coordinates: { latitude: found.latitude, longitude: found.longitude },
      images: found.images || [], tags: found.tags || [], type: found.type,
      createdBy: found.createdBy, createdByName: found.createdByName, pinColor: found.pinColor || '',
    });
  }, [focusPlaceId, dbPosts]);

  const openPanel = () => {
    setIsOpen(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      damping: 20,
      stiffness: 170,
      mass: 0.95,
      useNativeDriver: false,
    }).start();
  };

  const closePanel = () => {
    Keyboard.dismiss();
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 180,
      mass: 1,
      useNativeDriver: false,
    }).start(() => {
      setIsOpen(false);
    });
  };

  // DB posts available for future use (search, navigation, etc.)
  // Bus routes are rendered as Polylines via BUS_ROUTES data

  const handleMarkerPress = async (marker: any) => {
    const nextRegion: Region = {
      latitude: marker.coordinates.latitude,
      longitude: marker.coordinates.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    mapRef.current?.animateToRegion(nextRegion, 700);
    Keyboard.dismiss();
    if (isOpen) closePanel();

    setSelectedMarker(marker);
    popupAnim.setValue(0);
    Animated.timing(popupAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    setEditing(false);
    setEditTitle(marker.name || '');
    setEditDescription(marker.description || '');
    setPopupLoading(true);
    setMyReaction(null);
    setIsSaved(false);
    setPopupReactions([]);

    try {
      if (marker.id) {
        const reactions = await getReactions(marker.id);
        setPopupReactions(reactions);
        if (user) {
          const mine = reactions.find((r: any) => r.userId === user.uid);
          if (mine) setMyReaction(mine.emoji);
          const saved = await getSavedPlaces(user.uid);
          setIsSaved(saved.some((s: any) => s.placeId === marker.id));
        }
      }
    } catch {}
    setPopupLoading(false);
  };

  const closePopup = () => {
    Animated.timing(popupAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSelectedMarker(null);
      setEditing(false);
      setShowEmojiPicker(false);
    });
  };

  const handlePopupEmojiPick = async (emojiObject: any) => {
    if (!user || !selectedMarker?.id) return;
    try {
      await addReaction(selectedMarker.id, { userId: user.uid, emoji: emojiObject.emoji });
      setMyReaction(emojiObject.emoji);
      setShowEmojiPicker(false);
      const updated = await getReactions(selectedMarker.id);
      setPopupReactions(updated);
    } catch {}
  };

  const handlePopupRemoveReaction = async () => {
    if (!user || !selectedMarker?.id) return;
    try {
      await deleteReaction(selectedMarker.id, user.uid);
      setMyReaction(null);
      const updated = await getReactions(selectedMarker.id);
      setPopupReactions(updated);
    } catch {}
  };

  const handlePopupSave = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Log in to save places.', [
        { text: 'Cancel' },
        { text: 'Log In', onPress: () => router.push('/login') },
      ]);
      return;
    }
    if (!selectedMarker?.id) return;
    try {
      if (isSaved) {
        await unsavePlace(user.uid, selectedMarker.id);
        setIsSaved(false);
      } else {
        await savePlace(
          user.uid,
          selectedMarker.id,
          selectedMarker.name,
          selectedMarker.coordinates?.latitude,
          selectedMarker.coordinates?.longitude,
        );
        setIsSaved(true);
      }
    } catch {}
  };

  const handlePopupDelete = () => {
    if (!selectedMarker?.id) return;
    Alert.alert('Delete Post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(selectedMarker.id);
            closePopup();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handlePopupSaveEdit = async () => {
    if (!selectedMarker?.id) return;
    try {
      await updatePost(selectedMarker.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });
      setEditing(false);
      setSelectedMarker({ ...selectedMarker, name: editTitle.trim(), description: editDescription.trim() });
      Alert.alert('Updated!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const popupEmojiBreakdown = () => {
    const counts: Record<string, number> = {};
    popupReactions.forEach((r: any) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  };

  
  if (!region) return null;

  // IDs of routes in the currently selected option
  const selectedOptionRouteIds = new Set(selectedOption?.routes.map((r) => r.id) ?? []);

  // IDs of routes that appear in ANY available option (candidate routes)
  const candidateRouteIds = new Set(routeOptions.flatMap((o) => o.routes.map((r) => r.id)));

  // Always render ALL BUS_ROUTES with stable keys to prevent MapView ghost-polyline bugs.
  // Visibility (show/hide/highlight) is controlled purely via strokeColor and strokeWidth.
  const displayRoutes = BUS_ROUTES;

  // Show stops only for the routes in the selected option
  const displayStops: typeof BUS_STOPS = [];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsPointsOfInterest={false}
        onRegionChangeComplete={(r) => {
          if (pinDropMode && region) {
            // Limit pin drop to 100 mile radius from user's location
            const toRad = (deg: number) => (deg * Math.PI) / 180;
            const R = 3958.8; // Earth radius in miles
            const dLat = toRad(r.latitude - region.latitude);
            const dLon = toRad(r.longitude - region.longitude);
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(region.latitude)) * Math.cos(toRad(r.latitude)) * Math.sin(dLon / 2) ** 2;
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            if (dist <= 100) {
              setPinLocation({ latitude: r.latitude, longitude: r.longitude });
            } else {
              // Snap back to user location
              Alert.alert('Too far', 'Pin must be within 100 miles of your location.');
              mapRef.current?.animateToRegion({
                latitude: region.latitude,
                longitude: region.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 500);
              setPinLocation({ latitude: region.latitude, longitude: region.longitude });
            }
          }
        }}
      >

        {displayRoutes.flatMap((route) => {
          const isCandidate = candidateRouteIds.has(route.id);
          const isSelected = selectedOptionRouteIds.has(route.id);

          // Visibility rules:
          //  • No nav mode            → show all routes normally (showAllRoutes toggle)
          //  • Nav mode, loading      → hide everything (candidateRouteIds empty)
          //  • Nav mode, no selection → show all candidates at equal weight
          //  • Nav mode, selection    → highlight selected, hide the rest
          let strokeColor: string;
          let strokeWidth: number;

          if (!navDestination) {
            if (!showAllRoutes) {
              strokeColor = 'transparent';
              strokeWidth = 0;
            } else if (filteredRouteIds !== null && !filteredRouteIds.includes(route.id)) {
              strokeColor = 'transparent';
              strokeWidth = 0;
            } else {
              strokeColor = route.color;
              strokeWidth = 4;
            }
          } else if (selectedOption) {
            strokeColor = isSelected ? route.color : 'transparent';
            strokeWidth = isSelected ? 7 : 0;
          } else if (isCandidate) {
            strokeColor = route.color;
            strokeWidth = 5;
          } else {
            strokeColor = 'transparent';
            strokeWidth = 0;
          }

          // Include a state fingerprint in the key so React Native fully destroys
          // and recreates the native Polyline view whenever selection changes.
          // This is required because react-native-maps does not reliably update
          // strokeColor/strokeWidth on already-mounted native views.
          const selectionFingerprint = selectedOption
            ? `sel-${selectedOption.routes.map((r) => r.id).join('-')}`
            : navDestination
            ? `cand-${[...candidateRouteIds].sort().join('-')}`
            : filteredRouteIds !== null
            ? `filter-${[...filteredRouteIds].sort().join('-')}`
            : 'normal';

          return route.segments.map((segment, segIdx) => (
            <Polyline
              key={`${route.id}-${segIdx}-${selectionFingerprint}`}
              coordinates={segment}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              zIndex={isSelected ? 2 : 1}
            />
          ));
        })}

        {/* Origin marker (only when user set a custom origin) */}
        {navOrigin && (
          <Marker
            coordinate={{ latitude: navOrigin.latitude, longitude: navOrigin.longitude }}
            pinColor="green"
          />
        )}

        {/* Destination marker */}
        {navDestination && (
          <Marker
            coordinate={{ latitude: navDestination.latitude, longitude: navDestination.longitude }}
            pinColor="red"
          />
        )}

        {/* Bus stop markers — only shown for the selected route */}
        {displayStops.map((stop) => (
          <Marker
            key={`stop-${stop.id}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={stop.name}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.busStopMarker}>
              <View style={styles.busStopDot} />
            </View>
          </Marker>
        ))}

        {/* Board / alight / transfer stop pins — only when a route is selected */}
        {selectedOption && (
          <>
            <Marker
              coordinate={selectedOption.boardStop}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={stopPinStyles.pin}>
                <View style={[stopPinStyles.bubble, { backgroundColor: '#1565C0' }]}>
                  <Text style={stopPinStyles.label}>Board</Text>
                </View>
                <View style={[stopPinStyles.tail, { borderTopColor: '#1565C0' }]} />
              </View>
            </Marker>
            {selectedOption.transferStop && (
              <Marker
                coordinate={selectedOption.transferStop}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
              >
                <View style={stopPinStyles.pin}>
                  <View style={[stopPinStyles.bubble, { backgroundColor: '#F57F17' }]}>
                    <Text style={stopPinStyles.label}>Transfer</Text>
                  </View>
                  <View style={[stopPinStyles.tail, { borderTopColor: '#F57F17' }]} />
                </View>
              </Marker>
            )}
            <Marker
              coordinate={selectedOption.alightStop}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={stopPinStyles.pin}>
                <View style={[stopPinStyles.bubble, { backgroundColor: '#2E7D32' }]}>
                  <Text style={stopPinStyles.label}>Get off</Text>
                </View>
                <View style={[stopPinStyles.tail, { borderTopColor: '#2E7D32' }]} />
              </View>
            </Marker>
          </>
        )}

        {/* Walking paths: origin → board stop, alight stop → destination */}
        {walkingPaths && (
            <>
              <Polyline
                coordinates={walkingPaths.toBoard}
                strokeColor="#1565C0"
                strokeWidth={5}
                lineDashPattern={[12, 4]}
              />
              <Polyline
                coordinates={walkingPaths.fromAlight}
                strokeColor="#1565C0"
                strokeWidth={5}
                lineDashPattern={[12, 4]}
              />
            </>
          )}

      </MapView>

      {/* Center pin for pin drop mode */}
      {pinDropMode && (
        <>
          <Animated.View style={[styles.centerPin, {
            opacity: pinDropAnim,
            transform: [{
              translateY: pinDropAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-30, 0],
              }),
            }],
          }]} pointerEvents="none">
            <View style={styles.pinHead} />
            <View style={styles.pinTip} />
            <View style={styles.pinShadow} />
          </Animated.View>
          <Animated.View
            style={[
              styles.pinDropBar,
              {
                opacity: pinDropAnim,
                transform: [{
                  translateY: pinDropAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                }],
              }
            ]}
          >
            <Text style={styles.pinDropText}>Drag map to place your pin</Text>
            <Text style={styles.pinDropSubtext}>Within 100 miles of your location</Text>
            <View style={styles.pinDropButtons}>
              <Pressable
                style={[
                  styles.pinDropCancel,
                  pinDropCancelPressed && { opacity: 0.7 }
                ]}
                onPressIn={() => setPinDropCancelPressed(true)}
                onPressOut={() => setPinDropCancelPressed(false)}
                onPress={() => {
                  Animated.timing(pinDropAnim, {
                    toValue: 0, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: false,
                  }).start(() => { setPinDropMode(false); setPinLocation(null); });
                }}
              >
                <Text style={styles.pinDropCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.pinDropConfirm,
                  pinDropConfirmPressed && { opacity: 0.8 }
                ]}
                onPressIn={() => setPinDropConfirmPressed(true)}
                onPressOut={() => setPinDropConfirmPressed(false)}
                onPress={() => {
                  Animated.timing(pinDropAnim, {
                    toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: false,
                  }).start(() => {
                    setPinDropMode(false);
                    setTimeout(() => setActionSheetVisible(true), 50);
                  });
                }}
              >
                <Text style={styles.pinDropConfirmText}>Confirm Location</Text>
              </Pressable>
            </View>
          </Animated.View>
        </>
      )}

     <Animated.View
  pointerEvents={isOpen ? 'none' : 'auto'}
  style={[
    styles.rightButtons,
    {
      bottom: slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [COLLAPSED_HEIGHT + 60, PANEL_HEIGHT],
      }),
      opacity: slideAnim.interpolate({
        inputRange: [0, 0.2, 0.4],
        outputRange: [1, 0.45, 0],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          scale: slideAnim.interpolate({
            inputRange: [0, 0.4],
            outputRange: [1, 0.92],
            extrapolate: 'clamp',
          }),
        },
      ],
    },
  ]}
>
  {!pinDropMode && (
    <>
      <Pressable
        style={styles.circleButton}
        onPress={() => {
          if (user) {
            setPinDropMode(true);
            pinDropAnim.setValue(0);
            Animated.timing(pinDropAnim, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start();
            setPinLocation(region ? { latitude: region.latitude, longitude: region.longitude } : null);
          } else {
            router.push('/login');
          }
        }}
      >
        <Text style={styles.circleButtonText}>+</Text>
      </Pressable>

      
    </>
  )}
</Animated.View>


      {/* ── Favorite Trips Strip (visible when panel is collapsed) ── */}
      {favoriteTrips.length > 0 && !isOpen && !navDestination && (
        <Animated.View
          style={[
            starStyles.strip,
            {
              bottom: COLLAPSED_HEIGHT,
              opacity: slideAnim.interpolate({
                inputRange: [0, 0.2],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
          pointerEvents="box-none"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={starStyles.stripContent}
            keyboardShouldPersistTaps="handled"
          >
            {favoriteTrips.map((fav) => {
              const primaryRoute = BUS_ROUTES.find((r) => r.id === fav.routeIds[0]);
              if (!primaryRoute) return null;
              return (
                <TouchableOpacity
                  key={`${fav.id}-${fav.destination.name}`}
                  style={[starStyles.chip, { borderColor: primaryRoute.color }]}
                  onPress={() => handleRestoreFavorite(fav)}
                  activeOpacity={0.75}
                >
                  <View style={[starStyles.chipDot, { backgroundColor: primaryRoute.color }]} />
                  <Text style={starStyles.chipText} numberOfLines={1}>{fav.destination.name}</Text>
                  <TouchableOpacity
                    onPress={() => toggleFavoriteTrip(fav)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={starStyles.chipStar}>★</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

<SearchPanel
        isOpen={isOpen}
        slideAnim={slideAnim}
        panelHeight={PANEL_HEIGHT}
        collapsedHeight={COLLAPSED_HEIGHT}
        onOpen={openPanel}
        onClose={closePanel}
        showAllRoutes={showAllRoutes}
        onToggleAllRoutes={() => setShowAllRoutes(v => !v)}
        navDestination={navDestination}
        navOrigin={navOrigin}
        userCoords={{ latitude: region.latitude, longitude: region.longitude }}
        onSetDestination={(place) => {
          setNavDestination(place);
          setSelectedOption(null);
          if (place) {
            const origin = navOrigin ?? { latitude: region.latitude, longitude: region.longitude };
            const midLat = (origin.latitude + place.latitude) / 2;
            const midLng = (origin.longitude + place.longitude) / 2;
            const latDelta = Math.max(Math.abs(origin.latitude - place.latitude) * 2.2, 0.05);
            const lngDelta = Math.max(Math.abs(origin.longitude - place.longitude) * 2.2, 0.05);
            mapRef.current?.animateToRegion(
              { latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta },
              800
            );
          }
        }}
        onSetOrigin={setNavOrigin}
        routeOptions={routeOptions}
        selectedOption={selectedOption}
        onSelectOption={(opt) => setSelectedOption((prev) => prev?.id === opt.id ? null : opt)}
        routesLoading={routesLoading}
        onArrivalTimeChange={setArrivalTime}
        favoriteTrips={favoriteTrips}
        onToggleFavoriteTrip={toggleFavoriteTrip}
        onFilteredRouteIdsChange={setFilteredRouteIds}
        vehiclePositions={vehiclePositions}
      />

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => { setTimeout(() => setActionSheetVisible(false), 50); setPinLocation(null); }}
        onDragProgress={(progress) => dragProgressAnim.setValue(progress)}
        onPostCreated={() => showToast('Location shared!')}
        pinnedLocation={pinLocation}
      />

      {/* Place Popup */}
      {selectedMarker && (
        <>
          <Animated.View
            style={[
              popupStyles.backdrop,
              {
                opacity: popupAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
            pointerEvents={selectedMarker ? 'auto' : 'none'}
          >
            <Pressable style={{ flex: 1 }} onPress={closePopup} />
          </Animated.View>
          <Animated.View
            style={[
              popupStyles.sheet,
              {
                transform: [{
                  translateY: popupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                }],
              },
            ]}
          >
            <View {...popupPanResponder.panHandlers}>
              <View style={popupStyles.handleArea}>
                <View style={popupStyles.handle} />
              </View>
            </View>

            {popupLoading ? (
              <ActivityIndicator size="large" color="#8AA6A3" style={{ marginTop: 30 }} />
            ) : (
              <ScrollView contentContainerStyle={popupStyles.content} showsVerticalScrollIndicator={false}>
                {/* Top row: back + save */}
                <View style={popupStyles.topRow}>
                  <TouchableOpacity onPress={closePopup}>
                    <Text style={popupStyles.closeText}>←</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handlePopupSave}>
                    <Text style={popupStyles.saveText}>{isSaved ? '★ Saved' : '☆ Save'}</Text>
                  </TouchableOpacity>
                </View>

                {editing ? (
                  <View>
                    <TextInput style={popupStyles.editInput} value={editTitle} onChangeText={setEditTitle} placeholder="Title" />
                    <TextInput style={[popupStyles.editInput, { minHeight: 80, textAlignVertical: 'top' }]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" multiline />
                    <View style={popupStyles.editRow}>
                      <Pressable style={popupStyles.editSaveBtn} onPress={handlePopupSaveEdit}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                      </Pressable>
                      <Pressable style={popupStyles.editCancelBtn} onPress={() => setEditing(false)}>
                        <Text style={{ color: '#333', fontWeight: '600' }}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={popupStyles.title}>{selectedMarker.name}</Text>
                    {selectedMarker.createdByName && (
                      <Text style={popupStyles.byLine}>by {selectedMarker.createdByName}</Text>
                    )}

                    {selectedMarker.description ? (
                      <Text style={popupStyles.description}>{selectedMarker.description}</Text>
                    ) : null}

                    {/* Images */}
                    {selectedMarker.images && selectedMarker.images.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={popupStyles.imagesRow}>
                        {selectedMarker.images.map((uri: string, i: number) => (
                          <Pressable key={i} onPress={() => setExpandedImageIndex(i)}>
                            <Image source={{ uri }} style={popupStyles.placeImage} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}

                    {/* Tags */}
                    {selectedMarker.tags && selectedMarker.tags.length > 0 && (
                      <View style={popupStyles.tagsRow}>
                        {selectedMarker.tags.map((tag: string) => (
                          <View key={tag} style={popupStyles.tagChip}>
                            <Text style={popupStyles.tagChipText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Owner: Edit / Delete */}
                    {user && selectedMarker.createdBy === user.uid && (
                      <View style={popupStyles.ownerRow}>
                        <Pressable style={popupStyles.ownerBtn} onPress={() => setEditing(true)}>
                          <Text style={popupStyles.ownerBtnText}>Edit</Text>
                        </Pressable>
                        <Pressable style={[popupStyles.ownerBtn, popupStyles.deleteBtn]} onPress={handlePopupDelete}>
                          <Text style={[popupStyles.ownerBtnText, { color: '#E76F51' }]}>Delete</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}

                {/* Reactions */}
                {(() => {
                  const breakdown = popupEmojiBreakdown();
                  const topEmoji = breakdown.length > 0 ? breakdown[0] : null;
                  return (
                    <>
                      {topEmoji && (
                        <View style={popupStyles.topReaction}>
                          <Text style={{ fontSize: 32 }}>{topEmoji.emoji}</Text>
                          <Text style={popupStyles.topReactionCount}>{topEmoji.count}</Text>
                        </View>
                      )}
                      <View style={popupStyles.reactionSection}>
                        {myReaction ? (
                          <View style={popupStyles.myReactionRow}>
                            <Text style={{ fontSize: 28 }}>{myReaction}</Text>
                            <Pressable style={popupStyles.reactionBtn} onPress={() => setShowEmojiPicker(true)}>
                              <Text style={popupStyles.reactionBtnText}>Change</Text>
                            </Pressable>
                            <Pressable style={[popupStyles.reactionBtn, { backgroundColor: '#FEF2F2' }]} onPress={handlePopupRemoveReaction}>
                              <Text style={[popupStyles.reactionBtnText, { color: '#E76F51' }]}>Remove</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            style={popupStyles.addReactionBtn}
                            onPress={() => {
                              if (!user) {
                                Alert.alert('Login Required', 'Log in to react.', [
                                  { text: 'Cancel' },
                                  { text: 'Log In', onPress: () => router.push('/login') },
                                ]);
                              } else {
                                setShowEmojiPicker(true);
                              }
                            }}
                          >
                            <Text style={popupStyles.addReactionText}>+ React</Text>
                          </Pressable>
                        )}
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
            )}
          </Animated.View>

          <EmojiPicker
            onEmojiSelected={handlePopupEmojiPick}
            open={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
          />
        </>
      )}
{/* Fullscreen Image Viewer */}
      {expandedImageIndex !== null && selectedMarker?.images && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setExpandedImageIndex(null)}>
          <View style={popupStyles.imageViewerBackdrop}>
            <FlatList
              data={selectedMarker.images}
              horizontal
              pagingEnabled
              initialScrollIndex={expandedImageIndex}
              getItemLayout={(_, index) => ({
                length: Dimensions.get('window').width,
                offset: Dimensions.get('window').width * index,
                index,
              })}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }: { item: string }) => {
                const { width: screenW, height: screenH } = Dimensions.get('window');
                return (
                  <View style={{ width: screenW, height: screenH, justifyContent: 'center', alignItems: 'center' }}>
                    <ScrollView
                      maximumZoomScale={4}
                      minimumZoomScale={1}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      centerContent
                      style={{ width: screenW, height: screenH }}
                      contentContainerStyle={{ width: screenW, height: screenH, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Image source={{ uri: item }} style={{ width: screenW, height: screenH * 0.75 }} resizeMode="contain" />
                    </ScrollView>
                  </View>
                );
              }}
            />
            {selectedMarker.images.length > 1 && (
              <View style={popupStyles.imageCounter}>
                <Text style={popupStyles.imageCounterText}>
                  Swipe to view {selectedMarker.images.length} photos
                </Text>
              </View>
            )}
            <Pressable style={popupStyles.imageViewerClose} onPress={() => setExpandedImageIndex(null)}>
              <Text style={popupStyles.imageViewerCloseText}>{'\u2715'}</Text>
            </Pressable>
          </View>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <Animated.View style={[themeStyles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]} pointerEvents="none">
          <Text style={themeStyles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const themeStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 70,
    left: 40,
    right: 40,
    backgroundColor: '#8AA6A3',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  rightButtons: {
    position: 'absolute',
    right: 16,
    bottom: COLLAPSED_HEIGHT + 60,
    zIndex: 40,
  },
  circleButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  circleButtonText: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  calloutContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    width: 140,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  calloutImage: {
    width: 120,
    height: 80,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#e0e0e0',
  },
  calloutPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  calloutPlaceholderText: {
    fontSize: 28,
  },
  calloutName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -15,
    marginTop: -48,
    zIndex: 50,
    alignItems: 'center',
  },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EA4335',
    borderWidth: 3,
    borderColor: '#B31412',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EA4335',
    marginTop: -2,
  },
  pinShadow: {
    width: 14,
    height: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 2,
  },
  pinDropBar: {
    position: 'absolute',
    bottom: COLLAPSED_HEIGHT + 12,
    left: 11,
    right: 11,
    backgroundColor: '#fffffff6',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50,
  },
  pinDropText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 4,
  },
  pinDropSubtext: {
    fontSize: 13,
    color: '#999',
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 14,
  },
  pinDropButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  pinDropCancel: {
    flex: 1.3,
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  pinDropCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  pinDropConfirm: {
    flex: 1.7,
    backgroundColor: '#ffc107e7',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  pinDropConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  busStopMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busStopDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#333',
  },
});

const popupStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 90,
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '70%', paddingBottom: 30, zIndex: 91,
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#ccc' },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  closeText: { fontSize: 22, color: '#333', fontWeight: '600' },
  saveText: { fontSize: 15, color: '#8AA6A3', fontWeight: '700' },

  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 10 },
  meetupBadge: { backgroundColor: '#8AA6A3' },
  shareBadge: { backgroundColor: '#f5c842' },
  typeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 2 },
  byLine: { fontSize: 13, color: '#999', marginBottom: 10 },
  description: { fontSize: 14, color: '#555', lineHeight: 21, marginBottom: 12 },

  imagesRow: { marginBottom: 12 },
  placeImage: { width: 160, height: 110, borderRadius: 12, marginRight: 10, backgroundColor: '#e0e0e0' },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tagChip: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  tagChipText: { fontSize: 12, color: '#444', fontWeight: '500' },

  ownerRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  ownerBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  deleteBtn: { backgroundColor: '#FEF2F2' },
  ownerBtnText: { fontSize: 14, color: '#333', fontWeight: '600' },

  editInput: { backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', marginBottom: 10 },
  editRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  editSaveBtn: { backgroundColor: '#8AA6A3', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  editCancelBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },

  topReaction: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  topReactionCount: { fontSize: 18, fontWeight: '700', color: '#333' },

  reactionSection: { marginBottom: 10 },
  myReactionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reactionBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  reactionBtnText: { fontSize: 13, color: '#333', fontWeight: '500' },

  addReactionBtn: { backgroundColor: '#f5c842', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  addReactionText: { fontSize: 15, color: '#fff', fontWeight: '600' },

  imageViewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  imageViewerFull: { width: '100%', height: '80%' },
  imageViewerClose: { position: 'absolute', top: 60, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  imageViewerCloseText: { fontSize: 18, color: '#fff', fontWeight: '600' },
  imageCounter: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  imageCounterText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});


const stopPinStyles = StyleSheet.create({
  pin: { alignItems: 'center' },
  bubble: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  label: { fontSize: 11, fontWeight: '800', color: '#fff' },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});

const starStyles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    paddingBottom: 8,
  },
  stripContent: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
    maxWidth: 120,
  },
  chipStar: {
    fontSize: 14,
    color: '#FDD023',
    lineHeight: 16,
  },
});