import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
  fillContainer?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
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

  return (
    <View
      style={[
        styles.container,
        fillContainer ? styles.containerFill : { height: mapHeight },
        containerStyle,
      ]}
    >
      <MapView
        style={styles.map}
        initialRegion={region}
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
