import StoreMap from "@/components/StoreMap";
import { COLORS } from "@/constants/theme";
import type { Store } from "@/types/store";
import { buildStoreShareMessage, openStoreInMaps } from "@/utils/store";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const MAP_HEIGHT = Math.round(SCREEN_HEIGHT * 0.42);
const HEADER_ROW_HEIGHT = 64;
// Scroll distance over which the map fully hides.
const MAP_HIDE_RANGE = MAP_HEIGHT;

const showToast = (message: string) => {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert("", message);
};

export default function StoreDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const { id, storeData } = useLocalSearchParams<{
    id: string;
    storeData?: string;
  }>();

  const [store, setStore] = useState<Store | null>(() => {
    if (!storeData) return null;
    try {
      return JSON.parse(storeData) as Store;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(!store);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const mapTopOffset = insets.top + HEADER_ROW_HEIGHT;

  // Native-driver transforms — no layout thrashing while scrolling.
  const mapAnimatedStyle = useMemo(
    () => ({
      opacity: scrollY.interpolate({
        inputRange: [0, MAP_HIDE_RANGE * 0.55, MAP_HIDE_RANGE],
        outputRange: [1, 0.35, 0],
        extrapolate: "clamp",
      }),
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [0, MAP_HIDE_RANGE],
            outputRange: [0, -MAP_HEIGHT * 0.55],
            extrapolate: "clamp",
          }),
        },
      ],
    }),
    [scrollY],
  );

  const directionsOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, MAP_HIDE_RANGE * 0.25],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [scrollY],
  );

  const goHome = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  // Hardware back always returns to home from this screen.
  useEffect(() => {
    const onBackPress = () => {
      if (deleteConfirmVisible) {
        setDeleteConfirmVisible(false);
        return true;
      }
      goHome();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [deleteConfirmVisible, goHome]);

  const fetchStoreById = useCallback(async () => {
    if (!API_URL || !id) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}?action=getStores&lat=0&lng=0&radius=50&viewMode=all`,
      );
      const json = await response.json();
      if (json.status === "success") {
        const found = (json.data as Store[]).find((item) => item.id === id);
        if (found) setStore(found);
      }
    } catch (error) {
      console.error("Failed to load store details.", error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!store) fetchStoreById();
  }, [store, fetchStoreById]);

  const brandTags = useMemo(() => {
    if (!store) return [];
    const tags: string[] = [];
    if (store.hotwheels) tags.push("HOT WHEELS");
    if (store.matchbox) tags.push("MATCHBOX");
    if (store.other) tags.push("OTHER");
    return tags;
  }, [store]);

  const handleShare = () => {
    if (!store) return;
    Share.share({ message: buildStoreShareMessage(store) });
  };

  const handleEdit = () => {
    if (!store) return;
    router.replace({
      pathname: "/",
      params: { editStoreData: JSON.stringify(store) },
    });
  };

  const handleDelete = async () => {
    if (!store || !API_URL) return;
    setDeleteConfirmVisible(false);
    setIsDeleting(true);
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "deleteStore",
          storeId: store.id,
        }),
      });
      goHome();
    } catch {
      showToast("Failed to delete store.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!store) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="map-pin" size={40} color={COLORS.inactive} />
        <Text style={styles.emptyTitle}>Store Not Found</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goHome}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const lat = Number(store.lat);
  const lng = Number(store.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <View style={styles.mainWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.card} />

      <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={goHome}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {store.name}
          </Text>

          <TouchableOpacity
            onPress={handleShare}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="share-2" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {hasCoords ? (
        <Animated.View
          style={[
            styles.mapShell,
            { top: mapTopOffset, height: MAP_HEIGHT },
            mapAnimatedStyle,
          ]}
          pointerEvents="box-none"
        >
          <StoreMap
            lat={lat}
            lng={lng}
            name={store.name}
            fillContainer
            interactive={false}
          />
          <Animated.View
            style={[styles.directionsOverlay, { opacity: directionsOpacity }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.directionsFab}
              onPress={() => openStoreInMaps(store)}
              activeOpacity={0.85}
            >
              <Feather name="navigation" size={18} color="#fff" />
              <Text style={styles.directionsFabText}>Directions</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.ScrollView
        style={styles.detailsScroll}
        contentContainerStyle={[
          styles.detailsContent,
          {
            paddingTop: hasCoords ? MAP_HEIGHT - 16 : 16,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        <View style={styles.detailsSheet}>
          {!hasCoords ? (
            <View style={styles.noMapFallback}>
              <Feather name="map" size={32} color={COLORS.inactive} />
              <Text style={styles.noMapText}>No coordinates available</Text>
            </View>
          ) : null}

          <View style={styles.detailsCard}>
            <Text style={styles.storeName}>{store.name}</Text>

            <View style={styles.metaRow}>
              <Feather name="map-pin" size={14} color={COLORS.textMuted} />
              <Text style={styles.metaText}>
                {store.distance
                  ? `${store.distance} km away`
                  : store.address || "Manual Entry"}
              </Text>
            </View>

            {store.address ? (
              <View style={styles.metaRow}>
                <Feather name="home" size={14} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{store.address}</Text>
              </View>
            ) : null}

            {hasCoords ? (
              <TouchableOpacity
                style={styles.inlineDirectionsBtn}
                onPress={() => openStoreInMaps(store)}
                activeOpacity={0.8}
              >
                <Feather name="navigation" size={14} color={COLORS.primary} />
                <Text style={styles.inlineDirectionsText}>Open in Maps</Text>
              </TouchableOpacity>
            ) : null}

            {store.notes ? (
              <View style={styles.notesBox}>
                <Feather
                  name="message-square"
                  size={14}
                  color={COLORS.textMuted}
                  style={{ marginTop: 2 }}
                />
                <Text style={styles.notesText}>{store.notes}</Text>
              </View>
            ) : null}

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>Brands & Pricing</Text>
            <View style={styles.tagsRow}>
              {brandTags.length > 0 ? (
                brandTags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyTagText}>No brands listed</Text>
              )}
              {!store.other && store.price ? (
                <View style={styles.tagInfo}>
                  <Text style={styles.tagInfoText}>{store.price}</Text>
                </View>
              ) : null}
              {!store.other && store.bundle ? (
                <View style={styles.tagInfo}>
                  <Text style={styles.tagInfoText}>{store.bundle}</Text>
                </View>
              ) : null}
            </View>

            {hasCoords ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Coordinates</Text>
                <Text style={styles.coordText}>
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </Text>
              </>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={handleEdit}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={18} color={COLORS.text} />
              <Text style={styles.editBtnText}>Edit Store</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => setDeleteConfirmVisible(true)}
              activeOpacity={0.8}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color={COLORS.primary} />
                  <Text style={styles.deleteBtnText}>Delete Store</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.ScrollView>

      <Modal
        visible={deleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.confirmModalContent}>
            <View style={styles.dangerIconBg}>
              <Feather name="alert-triangle" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.confirmTitle}>Delete Location</Text>
            <Text style={styles.confirmText}>
              Are you sure you want to remove "{store.name}"? This action cannot
              be undone.
            </Text>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDeleteConfirmVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={handleDelete}
              >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={styles.deleteConfirmGradient}
                >
                  <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  headerSafeArea: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: HEADER_ROW_HEIGHT,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.tagBg,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: COLORS.text,
    marginHorizontal: 8,
  },
  mapShell: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1,
    overflow: "hidden",
    backgroundColor: COLORS.tagBg,
  },
  directionsOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  directionsFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  directionsFabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  detailsScroll: {
    flex: 1,
    zIndex: 2,
  },
  detailsContent: {
    flexGrow: 1,
  },
  detailsSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    minHeight: SCREEN_HEIGHT * 0.55,
  },
  noMapFallback: {
    height: 120,
    backgroundColor: COLORS.tagBg,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  noMapText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  storeName: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 24,
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  metaText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  inlineDirectionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "#FFF0F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  inlineDirectionsText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: COLORS.primary,
  },
  notesBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.tagBg,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  notesText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 16,
  },
  sectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emptyTagText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
  },
  tag: {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  tagInfo: {
    backgroundColor: COLORS.tagBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  tagInfoText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  coordText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
  },
  actionRow: {
    marginTop: 16,
    gap: 12,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  editBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FFF0F0",
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  deleteBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: COLORS.primary,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: COLORS.text,
    marginTop: 8,
  },
  backLinkBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  backLinkText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  dangerIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF0F0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  confirmTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  confirmText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.tagBg,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  deleteConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  deleteConfirmGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteConfirmBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
