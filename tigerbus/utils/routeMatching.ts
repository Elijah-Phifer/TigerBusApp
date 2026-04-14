import { BusRoute } from '../app/busRouteData';

export type GeoPoint = { latitude: number; longitude: number };

/** Haversine distance between two points in meters */
export function haversineMeters(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(p2.latitude - p1.latitude);
  const dLon = toRad(p2.longitude - p1.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.latitude)) *
      Math.cos(toRad(p2.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if `point` is within `thresholdMeters` of any vertex
 * in any segment of the route.
 */
export function isNearRoute(
  point: GeoPoint,
  segments: GeoPoint[][],
  thresholdMeters = 600
): boolean {
  for (const segment of segments) {
    for (const routePoint of segment) {
      if (haversineMeters(point, routePoint) <= thresholdMeters) {
        return true;
      }
    }
  }
  return false;
}

/**
 * A route "serves" a trip when it passes near BOTH origin and destination.
 */
export function routeServesTrip(
  route: BusRoute,
  origin: GeoPoint,
  destination: GeoPoint,
  thresholdMeters = 600
): boolean {
  return (
    isNearRoute(origin, route.segments, thresholdMeters) &&
    isNearRoute(destination, route.segments, thresholdMeters)
  );
}

/**
 * Clips a route's segments to only the portion between two stops.
 * Returns a single array of GeoPoints from boardStop to alightStop.
 */
export function clipRouteBetweenStops(
  segments: GeoPoint[][],
  boardStop: GeoPoint,
  alightStop: GeoPoint
): GeoPoint[] {
  // Flatten all segments into one continuous polyline
  const flat = segments.flat();

  // Find index of closest point to board and alight stops
  let boardIdx = 0;
  let alightIdx = 0;
  let boardDist = Infinity;
  let alightDist = Infinity;

  flat.forEach((pt, i) => {
    const dBoard = haversineMeters(pt, boardStop);
    const dAlight = haversineMeters(pt, alightStop);
    if (dBoard < boardDist) { boardDist = dBoard; boardIdx = i; }
    if (dAlight < alightDist) { alightDist = dAlight; alightIdx = i; }
  });

  // Ensure correct order
  const start = Math.min(boardIdx, alightIdx);
  const end = Math.max(boardIdx, alightIdx);

  return flat.slice(start, end + 1);
}