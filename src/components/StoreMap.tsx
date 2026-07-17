import { COLORS } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type StoreMapProps = {
  lat: number;
  lng: number;
  name: string;
  height?: number;
  fillContainer?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  interactive?: boolean;
  onNavigate?: () => void;
};

// OpenStreetMap raster tiles — free, no API key, no native module required.
// We stitch the tiles into a static preview so the map works in Expo Go and
// dev builds alike (react-native-maps is a native dependency that crashes in
// the managed workflow without a config plugin).
const TILE_SIZE = 256;
const ZOOM = 15;

const tileUrl = (x: number, y: number, z: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Convert lat/lng to fractional world tile coordinates at a given zoom.
const projectToTiles = (lat: number, lng: number, z: number) => {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
};

export default function StoreMap({
  lat,
  lng,
  name,
  height,
  fillContainer = false,
  containerStyle,
  interactive = true,
  onNavigate,
}: StoreMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const mapHeight = useMemo(() => {
    if (fillContainer) return undefined;
    if (height) return height;
    return Dimensions.get('window').height * 0.5;
  }, [fillContainer, height]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (width !== size.width || h !== size.height) {
      setSize({ width, height: h });
    }
  };

  // Build the set of tiles needed to cover the measured container, centered
  // on the target coordinate with the marker pinned to the middle.
  const tiles = useMemo(() => {
    const { width, height: h } = size;
    if (!width || !h || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return [];
    }

    const center = projectToTiles(lat, lng, ZOOM);
    const centerPxX = center.x * TILE_SIZE;
    const centerPxY = center.y * TILE_SIZE;

    // Top-left corner of the viewport in world-pixel space.
    const originX = centerPxX - width / 2;
    const originY = centerPxY - h / 2;

    const minTx = Math.floor(originX / TILE_SIZE);
    const maxTx = Math.floor((originX + width) / TILE_SIZE);
    const minTy = Math.floor(originY / TILE_SIZE);
    const maxTy = Math.floor((originY + h) / TILE_SIZE);

    const n = 2 ** ZOOM;
    const result: {
      key: string;
      uri: string;
      left: number;
      top: number;
    }[] = [];

    for (let tx = minTx; tx <= maxTx; tx += 1) {
      for (let ty = minTy; ty <= maxTy; ty += 1) {
        // Wrap horizontally; skip tiles off the poles vertically.
        if (ty < 0 || ty >= n) continue;
        const wrappedX = ((tx % n) + n) % n;
        result.push({
          key: `${tx}-${ty}`,
          uri: tileUrl(wrappedX, ty, ZOOM),
          left: tx * TILE_SIZE - originX,
          top: ty * TILE_SIZE - originY,
        });
      }
    }
    return result;
  }, [size, lat, lng]);

  const Wrapper: React.ComponentType<any> =
    interactive && onNavigate ? TouchableOpacity : View;
  const wrapperProps =
    interactive && onNavigate
      ? { activeOpacity: 0.9, onPress: onNavigate }
      : {};

  return (
    <Wrapper
      {...wrapperProps}
      accessibilityLabel={`Map showing ${name}`}
      onLayout={onLayout}
      style={[
        styles.container,
        fillContainer ? styles.containerFill : { height: mapHeight },
        containerStyle,
      ]}
    >
      <View style={StyleSheet.absoluteFill}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            style={{
              position: 'absolute',
              width: TILE_SIZE,
              height: TILE_SIZE,
              left: tile.left,
              top: tile.top,
            }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ))}
      </View>

      {/* Centered marker */}
      <View style={styles.markerWrap} pointerEvents="none">
        <View style={styles.markerPin}>
          <Feather name="map-pin" size={16} color="#fff" />
        </View>
        <View style={styles.markerShadow} />
      </View>

      {onNavigate ? (
        <TouchableOpacity
          style={styles.navigateFab}
          onPress={onNavigate}
          activeOpacity={0.85}
        >
          <Feather name="navigation" size={18} color="#fff" />
          <Text style={styles.navigateFabText}>Directions</Text>
        </TouchableOpacity>
      ) : null}

      {/* OSM attribution — required by the tile usage policy. */}
      <Text style={styles.attribution}>© OpenStreetMap</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: COLORS.tagBg,
    overflow: 'hidden',
  },
  containerFill: {
    flex: 1,
  },
  markerWrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    // Lift the pin so its point sits on the exact center.
    marginBottom: 8,
  },
  markerShadow: {
    width: 8,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: -6,
  },
  navigateFab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  navigateFabText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  attribution: {
    position: 'absolute',
    bottom: 2,
    left: 4,
    fontFamily: 'Poppins_400Regular',
    fontSize: 9,
    color: 'rgba(0,0,0,0.45)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 4,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
