import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addCheckin, getTodayCheckin, getPlaces, getPosts } from '../firebase/firestoreHelpers';

const BACKGROUND_LOCATION_TASK = 'background-location-checkin';
const CHECKIN_RADIUS_METERS = 100;

// ─── Get all locations (places + posts) ─────────────

async function getAllLocations(): Promise<any[]> {
  const [places, posts] = await Promise.all([getPlaces(), getPosts()]);

  // Normalize posts to match place format
  const normalizedPosts = posts.map((p: any) => ({
    id: p.id,
    name: p.title || 'Shared Location',
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  return [...places, ...normalizedPosts];
}

// ─── Haversine Distance (meters) ────────────────────

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ─── Tier 2: Foreground Check-in ────────────────────

export async function foregroundCheckin(userId: string): Promise<string | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({});
    const places = await getAllLocations();

    for (const place of places as any[]) {
      if (!place.latitude || !place.longitude) continue;

      const distance = haversineDistance(
        loc.coords.latitude, loc.coords.longitude,
        place.latitude, place.longitude
      );

      if (distance <= CHECKIN_RADIUS_METERS) {
        const alreadyCheckedIn = await getTodayCheckin(userId, place.id);
        if (!alreadyCheckedIn) {
          await addCheckin({
            userId,
            placeId: place.id,
            placeName: place.name,
            method: 'auto_foreground',
          });
          return place.name;
        }
      }
    }
    return null;
  } catch (e) {
    console.error('Foreground checkin error:', e);
    return null;
  }
}

// ─── Tier 1: Background Location Task ──────────────

let cachedUserId: string | null = null;

export function setBackgroundUserId(userId: string) {
  cachedUserId = userId;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (!cachedUserId || !data?.locations?.length) return;

  const { latitude, longitude } = data.locations[0].coords;

  try {
    const places = await getAllLocations();
    for (const place of places as any[]) {
      if (!place.latitude || !place.longitude) continue;

      const distance = haversineDistance(
        latitude, longitude,
        place.latitude, place.longitude
      );

      if (distance <= CHECKIN_RADIUS_METERS) {
        const alreadyCheckedIn = await getTodayCheckin(cachedUserId, place.id);
        if (!alreadyCheckedIn) {
          await addCheckin({
            userId: cachedUserId,
            placeId: place.id,
            placeName: place.name,
            method: 'auto_background',
          });
        }
      }
    }
  } catch (e) {
    console.error('Background checkin error:', e);
  }
});

export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return false;

    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!isStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        deferredUpdatesInterval: 60000,
        showsBackgroundLocationIndicator: true,
      });
    }
    return true;
  } catch (e) {
    // Silently fail in Expo Go — background location requires a dev build
    console.warn('Background location not available:', (e as any)?.message || e);
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e) {
    console.error('Failed to stop background location:', e);
  }
}

// ─── Tier 3: "Did you go?" Prompt Data ─────────────

export async function getNearbyPlacesForPrompt(userId: string): Promise<any[]> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return [];

    const loc = await Location.getCurrentPositionAsync({});
    const places = await getAllLocations();
    const nearby: any[] = [];

    for (const place of places as any[]) {
      if (!place.latitude || !place.longitude) continue;

      const distance = haversineDistance(
        loc.coords.latitude, loc.coords.longitude,
        place.latitude, place.longitude
      );

      if (distance <= 500) {
        const alreadyCheckedIn = await getTodayCheckin(userId, place.id);
        if (!alreadyCheckedIn) {
          nearby.push(place);
        }
      }
    }
    return nearby;
  } catch (e) {
    console.error('Nearby places error:', e);
    return [];
  }
}
