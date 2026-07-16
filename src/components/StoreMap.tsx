import { Feather } from '@expo/vector-icons';
import { useMemo, useRef } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { COLORS } from '@/constants/theme';

type StoreMapProps = {
  lat: number;
  lng: number;
  name: string;
  height?: number;
  // When true, map fills its parent (used with animated height containers).
  fillContainer?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  // Disable pan/zoom so ScrollView gestures are not blocked on the detail page.
  interactive?: boolean;
  onNavigate?: () => void;
};

// OpenStreetMap tiles are free and do not require a Google Maps API key.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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
  const mapRef = useRef<MapView>(null);
  const lastLayoutHeightRef = useRef(0);

  const mapHeight = useMemo(() => {
    if (fillContainer) return undefined;
    if (height) return height;
    return Dimensions.get('window').height * 0.5;
  }, [fillContainer, height]);

  const region = useMemo(
    () => ({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    }),
    [lat, lng],
  );

  // Keep marker centered when the collapsible container changes height.
  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (Math.abs(nextHeight - lastLayoutHeightRef.current) < 6) return;
    lastLayoutHeightRef.current = nextHeight;
    mapRef.current?.animateToRegion(region, 150);
  };

  return (
    <View
      onLayout={fillContainer ? handleContainerLayout : undefined}
      style={[
        styles.container,
        fillContainer ? styles.containerFill : { height: mapHeight },
        containerStyle,
      ]}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        // Hide default provider tiles so only free OpenStreetMap tiles render.
        mapType="none"
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        zoomTapEnabled={interactive}
        zoomControlEnabled={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
      >
        <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} />
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          title={name}
          pinColor={COLORS.primary}
        />
      </MapView>

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
    </View>
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
  map: {
    ...StyleSheet.absoluteFill,
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
});
