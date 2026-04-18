import { haversineMeters, GeoPoint } from './routeMatching';
import { BUS_ROUTES } from '../app/busRouteData';

export type VehiclePosition = {
  vehicleId: string;
  routeId: number;
  latitude: number;
  longitude: number;
  heading: number;       // degrees, 0 = north
  passengerLoad: number; // 0–1
};

// Simple deterministic PRNG (sine-based) so seed positions are stable across
// re-renders but look genuinely random along the route polyline.
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function bearing(p1: GeoPoint, p2: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(p2.longitude - p1.longitude);
  const lat1 = toRad(p1.latitude);
  const lat2 = toRad(p2.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function pointOnRoute(
  routeId: number,
  seed: number,
): { latitude: number; longitude: number; heading: number } {
  const route = BUS_ROUTES.find((r) => r.id === routeId);
  const fallback = { latitude: 30.4133, longitude: -91.1800, heading: 0 };
  if (!route) return fallback;

  // Flatten all segments into a single ordered list of points
  const pts = route.segments.flat();
  if (pts.length < 2) return { ...pts[0] ?? fallback, heading: 0 };

  // Pick a random index along the flattened polyline
  const idx = Math.floor(seededRand(seed) * (pts.length - 1));
  const p1 = pts[idx];
  const p2 = pts[idx + 1];

  // Interpolate between p1 → p2
  const t = seededRand(seed * 1.618);
  return {
    latitude:  p1.latitude  + (p2.latitude  - p1.latitude)  * t,
    longitude: p1.longitude + (p2.longitude - p1.longitude) * t,
    heading:   bearing(p1, p2),
  };
}

// Deterministic passenger loads per route
const LOADS = [
  0.35, 0.62, 0.48, 0.71, 0.28, 0.42, 0.33, 0.67,
  0.51, 0.38, 0.44, 0.77, 0.56, 0.22, 0.61, 0.85,
  0.73, 0.69, 0.82, 0.54, 0.19, 0.46, 0.37,
];

// Routes that get a second bus (higher-frequency / longer routes)
const TWO_BUS_ROUTES = new Set([1, 2, 3, 4, 5, 6, 9, 11, 12, 15, 16]);

const ALL_ROUTE_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23];

function makeSeedVehicles(): VehiclePosition[] {
  const vehicles: VehiclePosition[] = [];
  ALL_ROUTE_IDS.forEach((routeId, i) => {
    const pos1 = pointOnRoute(routeId, routeId * 137);
    vehicles.push({
      vehicleId:    `s${routeId}a`,
      routeId,
      ...pos1,
      passengerLoad: LOADS[i % LOADS.length],
    });
    if (TWO_BUS_ROUTES.has(routeId)) {
      const pos2 = pointOnRoute(routeId, routeId * 137 + 500);
      vehicles.push({
        vehicleId:    `s${routeId}b`,
        routeId,
        ...pos2,
        passengerLoad: LOADS[(i + 7) % LOADS.length],
      });
    }
  });
  return vehicles;
}

// Computed once at module load — stable across renders
const SEED_VEHICLES: VehiclePosition[] = makeSeedVehicles();

export async function fetchLiveVehicles(): Promise<VehiclePosition[]> {
  const ids = ALL_ROUTE_IDS.join(',');
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const url =
      `https://lsu.transloc.com/Services/JSONPRelay.svc/GetVehiclesForRoutes` +
      `?apiKey=8882812681&routeIds=${ids}&version=2`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    const data: any[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return SEED_VEHICLES;
    const parsed = data
      .filter((v) => v.Latitude != null && v.Longitude != null)
      .map((v) => ({
        vehicleId:    String(v.VehicleId    ?? v.vehicleId    ?? Math.random()),
        routeId:      Number(v.RouteId      ?? v.routeId      ?? 0),
        latitude:     Number(v.Latitude     ?? v.latitude),
        longitude:    Number(v.Longitude    ?? v.longitude),
        heading:      Number(v.Heading      ?? v.heading      ?? 0),
        passengerLoad: Number(v.PassengerLoad ?? v.passengerLoad ?? 0.3),
      }));
    return parsed.length > 0 ? parsed : SEED_VEHICLES;
  } catch {
    return SEED_VEHICLES;
  }
}

export type VehicleInfo = {
  etaMinutes: number;
  capacityText: string;
  capacityBg: string;
  capacityFg: string;
};

function capacityStyle(load: number): { text: string; bg: string; fg: string } {
  const pct = Math.round(load * 100);
  if (load < 0.4)  return { text: `${pct}% full`, bg: '#E8F5E9', fg: '#2e7d32' };
  if (load < 0.75) return { text: `${pct}% full`, bg: '#FFF8E1', fg: '#F57F17' };
  return                  { text: `${pct}% full`, bg: '#FFEBEE', fg: '#C62828' };
}

export function getVehicleInfoForBoardStop(
  vehicles: VehiclePosition[],
  routeId: number,
  boardStop: GeoPoint,
): VehicleInfo | null {
  const onRoute = vehicles.filter((v) => v.routeId === routeId);
  if (onRoute.length === 0) return null;

  const closest = onRoute.reduce((best, v) =>
    haversineMeters(v, boardStop) < haversineMeters(best, boardStop) ? v : best
  );

  const distM = haversineMeters(closest, boardStop);
  const etaMinutes = Math.max(1, Math.ceil(distM / 333));

  const cap = capacityStyle(closest.passengerLoad);
  return { etaMinutes, capacityText: cap.text, capacityBg: cap.bg, capacityFg: cap.fg };
}
