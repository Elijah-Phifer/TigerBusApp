import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Animated,
  Keyboard,
  Dimensions,
  PanResponder,
  Easing,
  TouchableOpacity,
  Alert
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import '../../global.css';
import markers from '../markers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { getReactions, getPlaceOfTheDay, addCheckin } from '../../firebase/firestoreHelpers';
import {
  foregroundCheckin,
  getNearbyPlacesForPrompt,
} from '../../utils/checkinService';
import ActionSheet from '../ActionSheet';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.5;
const COLLAPSED_HEIGHT = 110;

export default function HomeScreen() {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const { selected } = useLocalSearchParams<{
    selected?: string | string[];
  }>();

  const selectedFromParams = useMemo(() => {
    if (!selected) return [];
    if (Array.isArray(selected)) return selected;
    return selected.split('|').filter(Boolean);
  }, [selected]);

  const [chips, setChips] = useState<string[]>([
    'pickleball',
    'pottery',
    'bird watching',
    '⏏',
  ]);

  const [selectedChips, setSelectedChips] = useState<string[]>(selectedFromParams);
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region | null>(null);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<any>(null);
  const [topEmojis, setTopEmojis] = useState<Record<string, { emoji: string; count: number }>>({});
  const [placeOfTheDay, setPlaceOfTheDay] = useState<any>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const [sheetDragProgress, setSheetDragProgress] = useState(0);
  const dragProgressAnim = useRef(new Animated.Value(0)).current;


useEffect(() => {
  Animated.timing(dragProgressAnim, {
    toValue: sheetDragProgress,
    duration: 0, 
    useNativeDriver: false,
  }).start();
}, [sheetDragProgress]);

  useEffect(() => {
    setSelectedChips(selectedFromParams);
  }, [selectedFromParams]);

  useEffect(() => {
    if (selectedChips.length === 0) return;

    setChips((prev) => {
      const next = [...prev];
      const filterIndex = next.findIndex((chip) => chip === '⏏');

      selectedChips.forEach((chip) => {
        const exists = next.some(
          (existingChip) => existingChip.toLowerCase() === chip.toLowerCase()
        );

        if (!exists) {
          if (filterIndex === -1) {
            next.push(chip);
          } else {
            next.splice(filterIndex, 0, chip);
          }
        }
      });

      return next;
    });
  }, [selectedChips]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission denied');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});

      const newRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude + 0.01,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 1000);
    })();
  }, []);

  useEffect(() => {
    const loadReactions = async () => {
      const emojiMap: Record<string, { emoji: string; count: number }> = {};
      for (const marker of markers as any[]) {
        const placeId = marker.id;
        if (!placeId) continue;
        try {
          const reactions = await getReactions(placeId);
          if (reactions.length === 0) continue;
          const counts: Record<string, number> = {};
          reactions.forEach((r: any) => {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
          });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          emojiMap[placeId] = { emoji: top[0], count: top[1] };
        } catch {}
      }
      setTopEmojis(emojiMap);
    };
    loadReactions();

    getPlaceOfTheDay().then(result => {
      if (result) setPlaceOfTheDay(result);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;

    foregroundCheckin(user.uid);

    getNearbyPlacesForPrompt(user.uid).then(nearby => {
      if (nearby.length > 0) {
        const place = nearby[0];
        Alert.alert(
          'Did you visit?',
          `Were you at ${place.name} recently?`,
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes!',
              onPress: () => {
                addCheckin({
                  userId: user.uid,
                  placeId: place.id,
                  placeName: place.name,
                  method: 'manual_prompt',
                });
              },
            },
          ]
        );
      }
    }).catch(() => {});
  }, [user]);

  const openPanel = () => {
    setIsOpen(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const closePanel = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 420,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start(() => {
      setIsOpen(false);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 8,

      onPanResponderMove: (_, gestureState) => {
        const newHeight = PANEL_HEIGHT - gestureState.dy;
        const clampedHeight = Math.max(
          COLLAPSED_HEIGHT,
          Math.min(PANEL_HEIGHT, newHeight)
        );
        const progress =
          (clampedHeight - COLLAPSED_HEIGHT) /
          (PANEL_HEIGHT - COLLAPSED_HEIGHT);

        slideAnim.setValue(progress);
      },

      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > 60;
        const shouldOpen = gestureState.dy < -60;

        if (shouldClose) {
          closePanel();
        } else if (shouldOpen) {
          openPanel();
        } else {
          Animated.spring(slideAnim, {
            toValue: isOpen ? 1 : 0,
            damping: 18,
            stiffness: 140,
            mass: 0.9,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const filteredMarkers = markers.filter((marker: any) => {
    const markerName = marker.name.toLowerCase();
    const matchesSearch = markerName.includes(search.toLowerCase());

    const matchesChips =
      selectedChips.length === 0
        ? true
        : selectedChips.some((chip) =>
            markerName.includes(chip.toLowerCase())
          );

    return matchesSearch && matchesChips;
  });

  const handleMarkerPress = (marker: any) => {
    setSelectedMarker(marker);
    setIsOpen(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const clearMarkerDetails = () => {
    setSelectedMarker(null);
    closePanel();
  };

  const chipOpacity = slideAnim.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: [1, 0.85, 0.55, 0.2, 0],
    extrapolate: 'clamp',
  });

  const chipScale = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.985],
    extrapolate: 'clamp',
  });

  if (!region) return null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
      >
        {filteredMarkers.map((marker: any, index: number) => (
          <Marker
            key={index}
            title={marker.name}
            coordinate={marker.coordinates}
            onPress={() => handleMarkerPress(marker)}
          />
        ))}
      </MapView>

      <Animated.View
        pointerEvents={isOpen && !actionSheetVisible ? 'none' : 'auto'}
        style={[
          styles.chipsOverlay,
    {
      bottom: slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [COLLAPSED_HEIGHT + 12, PANEL_HEIGHT + 12],
        extrapolate: 'clamp',
      }),
      opacity: actionSheetVisible
        ? dragProgressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          })
        : chipOpacity,
      transform: [{ scale: chipScale }],
    },
        ]}
      >
        <View style={styles.chipsButtonContainer}>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              if (user) {
                setActionSheetVisible(true);
              } else {
                router.push('/login');
              }
            }}
          >
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {chips.map((chip) => {
            const active = selectedChips.includes(chip);

            return (
              <Pressable
                key={chip}
                onPress={() => {
                  if (chip === '⏏') {
                    router.push({
                      pathname: '/filter',
                      params: {
                        selected: selectedChips.join('|'),
                      },
                    });
                  } else {
                    setSelectedChips((prev) => {
                      const next = prev.includes(chip)
                        ? prev.filter((c) => c !== chip)
                        : [...prev, chip];

                      router.setParams({
                        selected: next.join('|'),
                      });

                      return next;
                    });
                  }
                }}
                style={[styles.chip, active && styles.activeChip]}
              >
                <Text style={[styles.chipText, active && styles.activeChipText]}>
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bottomPanel,
          {
            height: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [COLLAPSED_HEIGHT, PANEL_HEIGHT],
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
        <View style={styles.panelHandle} />

        {selectedMarker ? (
          <View style={styles.markerDetails}>
            <TouchableOpacity onPress={clearMarkerDetails} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.markerName}>{selectedMarker.name}</Text>
            <Text style={styles.markerCategory}>{selectedMarker.category}</Text>
            <Text style={styles.markerDescription}>{selectedMarker.description}</Text>
            <View style={styles.markerInfoRow}>
              <Text style={styles.markerInfoLabel}>Hours:</Text>
              <Text style={styles.markerInfoValue}>{selectedMarker.hours}</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.searchBarWrap}>
              <View style={styles.searchBar}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onFocus={openPanel}
                  placeholder="Search here"
                  placeholderTextColor="#555"
                  style={styles.searchInput}
                />
                {isOpen ? (
                  <Pressable onPress={closePanel}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.userPill}
                    onPress={() => {
                      if (user) {
                        router.push('/profile' as any);
                      } else {
                        router.push('/login' as any);
                      }
                    }}
                  >
                    <Text style={styles.userText}>{user ? (user.displayName || 'User') : 'Log In'}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Animated.View
              style={[
                styles.resultsContainer,
                {
                  opacity: slideAnim.interpolate({
                    inputRange: [0, 0.35, 1],
                    outputRange: [0, 0.2, 1],
                  }),
                },
              ]}
              pointerEvents={isOpen ? 'auto' : 'none'}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {placeOfTheDay && (
                  <Pressable
                    style={styles.potdCard}
                    onPress={() => {
                      router.push({
                        pathname: '/place-detail' as any,
                        params: {
                          placeId: placeOfTheDay.place.id,
                          placeName: placeOfTheDay.place.name,
                          latitude: String(placeOfTheDay.place.latitude || ''),
                          longitude: String(placeOfTheDay.place.longitude || ''),
                        },
                      });
                    }}
                  >
                    <Text style={styles.potdLabel}>Place of the Day</Text>
                    <View style={styles.potdRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.potdName}>{placeOfTheDay.place.name}</Text>
                      </View>
                      <View style={styles.potdEmoji}>
                        <Text style={styles.potdEmojiText}>{placeOfTheDay.topEmoji}</Text>
                        <Text style={styles.potdEmojiCount}>{placeOfTheDay.reactionCount}</Text>
                      </View>
                    </View>
                  </Pressable>
                )}

                {filteredMarkers.length > 0 ? (
                  filteredMarkers.map((marker: any, index: number) => (
                    <Pressable
                      key={index}
                      style={styles.resultItem}
                      onPress={() => {
                        router.push({
                          pathname: '/place-detail' as any,
                          params: {
                            placeId: marker.id || `marker_${index}`,
                            placeName: marker.name,
                            latitude: String(marker.coordinates.latitude),
                            longitude: String(marker.coordinates.longitude),
                          },
                        });
                      }}
                    >
                      <View style={styles.resultRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultTitle}>{marker.name}</Text>
                          <Text style={styles.resultSubtitle}>
                            {marker.coordinates.latitude.toFixed(4)}, {marker.coordinates.longitude.toFixed(4)}
                          </Text>
                        </View>
                        {topEmojis[marker.id] && (
                          <View style={styles.emojiPill}>
                            <Text style={styles.emojiPillText}>
                              {topEmojis[marker.id].emoji} {topEmojis[marker.id].count}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.noResults}>No matching places found.</Text>
                )}
              </ScrollView>
            </Animated.View>
          </>
        )}
      </Animated.View>
<ActionSheet
  visible={actionSheetVisible}
  onClose={() => setTimeout(() => setActionSheetVisible(false), 50)}
  onDragProgress={(progress) => dragProgressAnim.setValue(progress)}
/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  rightButtons: {
    position: 'absolute',
    right: 16,
    bottom: COLLAPSED_HEIGHT + 700,
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
  },
  chipsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: COLLAPSED_HEIGHT + 12,
    zIndex: 30,
  },
  chipsButtonContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
  },
  chipsRow: {
    paddingHorizontal: 14,
  },
  chip: {
    backgroundColor: 'rgba(240,240,240,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
  },
  activeChip: {
    backgroundColor: '#8AA6A3',
  },
  chipText: {
    fontSize: 14,
    color: '#222',
  },
  activeChipText: {
    color: '#fff',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    overflow: 'hidden',
    zIndex: 20,
    paddingTop: 10,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
    marginBottom: 10,
  },
  searchBarWrap: {
    width: '92%',
    alignSelf: 'center',
    marginBottom: 12,
  },
  searchBar: {
    minHeight: 58,
    borderRadius: 28,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchIcon: {
    fontSize: 22,
    color: '#222',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 10,
  },
  userPill: {
    backgroundColor: '#D9D9D9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginLeft: 10,
  },
  userText: {
    fontSize: 16,
    color: '#111',
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  resultItem: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  resultSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  noResults: {
    fontSize: 15,
    color: '#666',
    marginTop: 10,
  },
  markerDetails: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#f97316',
    fontWeight: '600',
  },
  markerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  markerCategory: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: '600',
    marginBottom: 8,
  },
  markerDescription: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  markerInfoRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  markerInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  markerInfoValue: {
    fontSize: 14,
    color: '#555',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiPill: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },
  emojiPillText: {
    fontSize: 14,
    color: '#333',
  },
  potdCard: {
    backgroundColor: '#8AA6A3',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  potdLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  potdRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  potdName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
potdEmoji: {
    alignItems: 'center',
    marginLeft: 12,
  },
  potdEmojiText: {
    fontSize: 28,
  },
  potdEmojiCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
});