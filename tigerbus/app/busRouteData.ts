import routeGeoJSON from '../assets/busRoutes.json';

// Colors keyed by TransLoc RouteID
export const ROUTE_COLORS: Record<number, string> = {
  1:  '#8CB811', // North Campus (TransLoc brand green)
  2:  '#2E7D32', // Burbank-Ben Hur
  3:  '#1565C0', // Nicholson-Ben Hur
  4:  '#BF360C', // Garden District
  5:  '#F9A825', // Gold
  6:  '#7B1FA2', // Purple
  7:  '#00695C', // Nicholson River Road A
  8:  '#00838F', // Nicholson River Road B
  9:  '#FB8C00', // Highland-Burbank
  10: '#558B2F', // Park & Geaux - Union
  11: '#AD1457', // Tigerland A
  12: '#E53935', // Tigerland B
  13: '#FF6F00', // Sunday Shuttle
  14: '#6A1B9A', // Geaux Gold
  15: '#283593', // Night Campus Circulator
  16: '#0277BD', // Night A
  17: '#4E342E', // Night D
  18: '#37474F', // Tigerland Express West
  19: '#00897B', // Tigerland Express East
  21: '#757575', // Charter
  22: '#C0CA33', // Park & Geaux
  23: '#5E35B1', // Park & Geaux - Lockett
};

export type BusRoute = {
  id: number;
  name: string;
  color: string;
  segments: Array<Array<{ latitude: number; longitude: number }>>;
};

function geoJsonCoordsToLatLng(
  coords: number[]
): { latitude: number; longitude: number } {
  return { latitude: coords[1], longitude: coords[0] };
}

export const BUS_ROUTES: BusRoute[] = (routeGeoJSON as any).features.map(
  (feature: any) => {
    const id: number = feature.properties.ROUTE_ID;
    const name: string = feature.properties.ROUTE_NAME;
    const color = ROUTE_COLORS[id] ?? feature.properties.COLOR ?? '#888888';
    const geomType: string = feature.geometry.type;

    let segments: Array<Array<{ latitude: number; longitude: number }>>;

    if (geomType === 'LineString') {
      segments = [feature.geometry.coordinates.map(geoJsonCoordsToLatLng)];
    } else if (geomType === 'MultiLineString') {
      segments = feature.geometry.coordinates.map((line: number[][]) =>
        line.map(geoJsonCoordsToLatLng)
      );
    } else {
      segments = [];
    }

    return { id, name, color, segments } as BusRoute;
  }
);
