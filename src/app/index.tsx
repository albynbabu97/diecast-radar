import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// LayoutAnimation on Android needs this only on the old architecture.
function isNewArchitectureEnabled(): boolean {
  const g = globalThis as typeof globalThis & {
    _IS_FABRIC_?: boolean;
    nativeFabricUIManager?: unknown;
    RN$Bridgeless?: boolean;
  };
  return Boolean(g.nativeFabricUIManager ?? g._IS_FABRIC_ ?? g.RN$Bridgeless);
}

if (
  Platform.OS === "android" &&
  !isNewArchitectureEnabled() &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { COLORS } from "@/constants/theme";
import type { Store } from "@/types/store";
import { buildStoreShareMessage, openStoreInMaps } from "@/utils/store";

// --- ENV CONFIGURATION ---
const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default function Index() {
  const router = useRouter();
  const { editStoreData } = useLocalSearchParams<{ editStoreData?: string }>();

  const flatListRef = useRef<FlatList>(null);

  const [view, setView] = useState<"radar" | "add">("radar");
  const [stores, setStores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [location, setLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "active" | "inactive"
  >("loading");

  const [viewMode, setViewMode] = useState<"nearby" | "all">("nearby");
  const [radius, setRadius] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [filterBrand, setFilterBrand] = useState({
    hw: false,
    mb: false,
    other: false,
  });
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterBundle, setFilterBundle] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formHW, setFormHW] = useState(false);
  const [formMB, setFormMB] = useState(false);
  const [formPrice, setFormPrice] = useState("MRP");
  const [formBundle, setFormBundle] = useState("Single");

  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapResults, setMapResults] = useState<any[]>([]);
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  // Custom Modal States
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [isModalVisible, setModalVisible] = useState(false);

  const [storeToDelete, setStoreToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearchRef = useRef<boolean>(false);
  const lastBackPressed = useRef(0);
  const skipRadiusFetchRef = useRef(true);

  // Only intercept Android back while this screen is focused (not on store detail).
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (deleteConfirmVisible) {
          setDeleteConfirmVisible(false);
          return true;
        }
        if (isModalVisible) {
          setModalVisible(false);
          return true;
        }
        if (view === "add") {
          closeForm();
          return true;
        }
        if (view === "radar") {
          const now = Date.now();
          if (now - lastBackPressed.current < 2000) {
            BackHandler.exitApp();
            return true;
          }
          lastBackPressed.current = now;
          if (Platform.OS === "android")
            ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [view, isModalVisible, deleteConfirmVisible]),
  );

  // --- INITIAL LOCATION CHECK ---
  useEffect(() => {
    checkLocationAndFetch();
  }, []);

  useEffect(() => {
    if (location || viewMode === "all") fetchStores();
  }, [location, viewMode]);

  // Debounce radius API calls so the label can update live while dragging.
  useEffect(() => {
    if (skipRadiusFetchRef.current) {
      skipRadiusFetchRef.current = false;
      return;
    }
    if (viewMode !== "nearby") return;

    const timer = setTimeout(() => {
      if (location) fetchStores();
    }, 1000);

    return () => clearTimeout(timer);
  }, [radius]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (mapSearchQuery.length < 3) {
      setMapResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(
      () => searchGooglePlaces(mapSearchQuery),
      600,
    );
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [mapSearchQuery]);

  const checkLocationAndFetch = async () => {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }

    if (status === "granted") {
      try {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
        setLocationStatus("active");
      } catch (e) {
        setLocationStatus("inactive");
      }
    } else {
      setLocationStatus("inactive");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await checkLocationAndFetch();
      await fetchStores(true);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters(!showFilters);
  };

  const handleTabSwitch = (mode: "nearby" | "all") => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode(mode);
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  };

  const searchGooglePlaces = async (query: string) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    setIsSearchingMap(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.results) setMapResults(json.results.slice(0, 4));
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearchingMap(false);
    }
  };

  const handleSelectMapResult = (place: any) => {
    setFormLat(place.geometry.location.lat.toString());
    setFormLng(place.geometry.location.lng.toString());
    if (!formName) setFormName(place.name);
    skipSearchRef.current = true;
    setMapSearchQuery(place.name);
    setMapResults([]);
  };

  const fetchStores = async (isRefresh = false) => {
    if (!API_URL) {
      ToastAndroid.show(
        "API URL is not configured for this build.",
        ToastAndroid.LONG,
      );
      return;
    }
    if (!isRefresh) setIsLoading(true);
    try {
      const lat = location?.latitude || 0;
      const lng = location?.longitude || 0;
      const response = await fetch(
        `${API_URL}?action=getStores&lat=${lat}&lng=${lng}&radius=${radius}&viewMode=${viewMode}`,
      );
      const json = await response.json();
      if (json.status === "success") setStores(json.data || []);
    } catch (error) {
      console.error("Network Error: Could not fetch stores.");
    } finally {
      if (!isRefresh) setIsLoading(false);
    }
  };

  const captureCurrentCoords = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      setFormLat(loc.coords.latitude.toString());
      setFormLng(loc.coords.longitude.toString());
    } catch (error) {
      console.error("Error: Could not fetch current coordinates.");
    }
  };

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (
        searchQuery &&
        !store.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      const hasOtherBrand =
        store.other || (!store.hotwheels && !store.matchbox);
      if (filterBrand.hw && !store.hotwheels) return false;
      if (filterBrand.mb && !store.matchbox) return false;
      if (filterBrand.other && !hasOtherBrand) return false;
      if (filterPrice && store.price !== filterPrice) return false;
      if (filterBundle && store.bundle !== filterBundle) return false;
      return true;
    });
  }, [stores, searchQuery, filterBrand, filterPrice, filterBundle]);

  const handleSave = async () => {
    if (!formName || !formLat || !formLng)
      return ToastAndroid.show(
        "Store name and coordinates are required.",
        ToastAndroid.SHORT,
      );
    if (!API_URL) return;
    setIsLoading(true);
    try {
      const payload = {
        id: editingId,
        name: formName,
        lat: parseFloat(formLat),
        lng: parseFloat(formLng),
        hotwheels: formHW,
        matchbox: formMB,
        priceType: formPrice,
        bundleType: formBundle,
        notes: formNotes,
      };
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: editingId ? "updateStore" : "addStore",
          storeData: payload,
        }),
      });
      const json = await response.json();
      if (json.status === "success") {
        closeForm();
        fetchStores();
      } else ToastAndroid.show(json.message, ToastAndroid.SHORT);
    } catch (error) {
      ToastAndroid.show("Failed to save data.", ToastAndroid.SHORT);
    } finally {
      setIsLoading(false);
    }
  };

  const promptDelete = (id: string, name: string) => {
    setModalVisible(false);
    setStoreToDelete({ id, name });
    setDeleteConfirmVisible(true);
  };

  const executeDelete = async () => {
    if (!storeToDelete) return;
    setDeleteConfirmVisible(false);
    setIsLoading(true);
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "deleteStore",
          storeId: storeToDelete.id,
        }),
      });
      fetchStores();
    } catch (e) {
      setIsLoading(false);
    }
    setStoreToDelete(null);
  };

  const handleEdit = (store: any) => {
    setEditingId(store.id);
    setFormName(store.name);
    setFormLat(store.lat?.toString() || "");
    setFormLng(store.lng?.toString() || "");
    setFormNotes(store.notes);
    setFormHW(store.hotwheels);
    setFormMB(store.matchbox);
    setFormPrice(store.price || "MRP");
    setFormBundle(store.bundle || "Single");
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setView("add");
  };

  // Open edit form when returning from the store detail page.
  useEffect(() => {
    if (!editStoreData) return;
    try {
      const store = JSON.parse(editStoreData) as Store;
      handleEdit(store);
      router.setParams({ editStoreData: undefined });
    } catch {
      // Ignore malformed navigation params.
    }
  }, [editStoreData]);

  const handleNavigation = (item: Store) => {
    openStoreInMaps(item);
  };

  const openStoreDetail = (item: Store) => {
    router.push({
      pathname: "/store/[id]",
      params: {
        id: item.id,
        storeData: JSON.stringify(item),
      },
    });
  };

  const showMoreOptions = (item: any) => {
    setSelectedStore(item);
    setModalVisible(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setFormName("");
    skipSearchRef.current = true;
    setMapSearchQuery("");
    setMapResults([]);
    setFormLat("");
    setFormLng("");
    setFormNotes("");
    setFormHW(false);
    setFormMB(false);
    setFormPrice("MRP");
    setFormBundle("Single");
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setView("radar");
  };

  const openAddForm = () => {
    if (location) {
      setFormLat(location.latitude.toString());
      setFormLng(location.longitude.toString());
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setView("add");
  };

  const FilterPill = ({ label, active, onPress, flex }: any) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.filterPill,
        active && styles.filterPillActive,
        flex && { flex: 1 },
      ]}
    >
      <Text
        style={[styles.filterPillText, active && styles.filterPillTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderRadarBoard = () => (
    <View style={styles.radarContainer}>
      <View style={styles.filterCard}>
        <TouchableOpacity
          style={styles.filterDrawerBtn}
          onPress={toggleFilters}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.searchIconBox}>
              <Feather name="search" size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.filterDrawerText}>
              Search & Filter Locations
            </Text>
          </View>
          <Feather
            name={showFilters ? "chevron-up" : "chevron-down"}
            size={20}
            color={COLORS.textMuted}
          />
        </TouchableOpacity>

        {showFilters && (
          <View style={styles.filterDrawerContent}>
            <TextInput
              style={styles.searchInput}
              placeholder="Type store name..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {viewMode === "nearby" && locationStatus === "active" && (
              <View style={{ marginBottom: 16 }}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>Search Radius</Text>
                  <Text style={styles.sliderValue}>{radius} km</Text>
                </View>
                <Slider
                  style={{ width: "100%", height: 30 }}
                  minimumValue={1}
                  maximumValue={50}
                  step={1}
                  value={radius}
                  onValueChange={setRadius}
                  minimumTrackTintColor={COLORS.primary}
                  maximumTrackTintColor={COLORS.tagBorder}
                  thumbTintColor={COLORS.primary}
                />
              </View>
            )}

            <Text style={styles.filterGroupLabel}>Brands</Text>
            <View style={styles.filterRow}>
              <FilterPill
                flex
                label="Hot Wheels"
                active={filterBrand.hw}
                onPress={() =>
                  setFilterBrand({ ...filterBrand, hw: !filterBrand.hw })
                }
              />
              <FilterPill
                flex
                label="Matchbox"
                active={filterBrand.mb}
                onPress={() =>
                  setFilterBrand({ ...filterBrand, mb: !filterBrand.mb })
                }
              />
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterGroupLabel}>Pricing</Text>
                <View style={styles.filterRow}>
                  <FilterPill
                    flex
                    label="MRP"
                    active={filterPrice === "MRP"}
                    onPress={() =>
                      setFilterPrice(filterPrice === "MRP" ? null : "MRP")
                    }
                  />
                  <FilterPill
                    flex
                    label="Custom"
                    active={filterPrice === "Custom"}
                    onPress={() =>
                      setFilterPrice(filterPrice === "Custom" ? null : "Custom")
                    }
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterGroupLabel}>Format</Text>
                <View style={styles.filterRow}>
                  <FilterPill
                    flex
                    label="Single"
                    active={filterBundle === "Single"}
                    onPress={() =>
                      setFilterBundle(
                        filterBundle === "Single" ? null : "Single",
                      )
                    }
                  />
                  <FilterPill
                    flex
                    label="Combo"
                    active={filterBundle === "Combo"}
                    onPress={() =>
                      setFilterBundle(filterBundle === "Combo" ? null : "Combo")
                    }
                  />
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* --- ADDED LOADER CONDITION HERE --- */}
      {isLoading && !refreshing ? (
        <View style={{ paddingTop: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredStores}
          keyExtractor={(item) => item.id}
          style={styles.storeList}
          contentContainerStyle={styles.storeListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            viewMode === "nearby" && locationStatus === "inactive" ? (
              <View style={styles.emptyStateContainer}>
                <Feather
                  name="map-pin"
                  size={40}
                  color={COLORS.inactive}
                  style={{ marginBottom: 16 }}
                />
                <Text style={styles.emptyTitle}>Location Disabled</Text>
                <Text style={styles.emptyText}>
                  Turn on location to find nearby stores, or switch to 'All
                  Stores' to browse the full directory.
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={checkLocationAndFetch}
                >
                  <Text style={styles.retryBtnText}>Enable Location</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.emptyText}>
                No locations match your radar.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openStoreDetail(item)}
              activeOpacity={0.75}
            >
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Feather
                      name="map-pin"
                      size={10}
                      color={COLORS.textMuted}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.cardSubtitle}>
                      {item.distance
                        ? `${item.distance} km away`
                        : "Manual Entry"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.instamartBtn}
                  onPress={() => handleNavigation(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.instamartBtnPlus}>
                    <Feather name="navigation" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>

              {item.notes ? (
                <View style={styles.cardNotesBox}>
                  <Feather
                    name="message-square"
                    size={12}
                    color={COLORS.textMuted}
                    style={{ marginTop: 2 }}
                  />
                  <Text style={styles.cardNotesText}>{item.notes}</Text>
                </View>
              ) : null}

              <View style={styles.cardDivider} />

              <View style={styles.cardBottomRow}>
                <View style={styles.tagsRow}>
                  {item.hotwheels && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>HOT WHEELS</Text>
                    </View>
                  )}
                  {item.matchbox && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>MATCHBOX</Text>
                    </View>
                  )}
                  {item.other && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>OTHER</Text>
                    </View>
                  )}
                  {!item.other && (
                    <View style={styles.tagInfo}>
                      <Text style={styles.tagInfoText}>{item.price}</Text>
                    </View>
                  )}
                  {!item.other && (
                    <View style={styles.tagInfo}>
                      <Text style={styles.tagInfoText}>{item.bundle}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.moreBtn}
                  onPress={() => showMoreOptions(item)}
                >
                  <Feather
                    name="more-horizontal"
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={openAddForm}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderAddForm = () => (
    <View style={styles.formView}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ backgroundColor: COLORS.card }}
      >
        <View style={styles.formHeaderRow}>
          <TouchableOpacity onPress={closeForm} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.formTitle}>
            {editingId ? "Modify Location" : "New Location"}
          </Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.label}>Store Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Target Toy Section"
            placeholderTextColor={COLORS.textMuted}
            value={formName}
            onChangeText={setFormName}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>
            Google Maps Auto-Locate
          </Text>
          <View style={styles.mapsSearchWrapper}>
            <Feather
              name="search"
              size={18}
              color={COLORS.textMuted}
              style={{ marginLeft: 14 }}
            />
            <TextInput
              style={styles.mapsInput}
              placeholder="Search places..."
              placeholderTextColor={COLORS.textMuted}
              value={mapSearchQuery}
              onChangeText={setMapSearchQuery}
            />
            {isSearchingMap && (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ marginRight: 14 }}
              />
            )}
          </View>

          {mapResults.length > 0 && (
            <View style={styles.mapResultsBox}>
              {mapResults.map((place, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.mapResultItem}
                  onPress={() => handleSelectMapResult(place)}
                >
                  <Text style={styles.mapResultName}>{place.name}</Text>
                  <Text style={styles.mapResultAddress} numberOfLines={1}>
                    {place.formatted_address}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={formLat}
                onChangeText={setFormLat}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={formLng}
                onChangeText={setFormLng}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={captureCurrentCoords}
          >
            <Feather name="crosshair" size={14} color={COLORS.primary} />
            <Text style={styles.captureText}>Use Current GPS</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Brands Carried</Text>
          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setFormHW(!formHW)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.customCheck, formHW && styles.customCheckActive]}
              >
                {formHW && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>Hot Wheels</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setFormMB(!formMB)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.customCheck, formMB && styles.customCheckActive]}
              >
                {formMB && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>Matchbox</Text>
            </TouchableOpacity>
          </View>

          {(formHW || formMB) && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.label}>Pricing Model</Text>
              <View style={styles.segmentContainer}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    formPrice === "MRP" && styles.segmentActive,
                  ]}
                  onPress={() => setFormPrice("MRP")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formPrice === "MRP" && styles.segmentTextActive,
                    ]}
                  >
                    MRP
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    formPrice === "Custom" && styles.segmentActive,
                  ]}
                  onPress={() => setFormPrice("Custom")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formPrice === "Custom" && styles.segmentTextActive,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Format</Text>
              <View style={styles.segmentContainer}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    formBundle === "Single" && styles.segmentActive,
                  ]}
                  onPress={() => setFormBundle("Single")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formBundle === "Single" && styles.segmentTextActive,
                    ]}
                  >
                    Single
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    formBundle === "Combo" && styles.segmentActive,
                  ]}
                  onPress={() => setFormBundle("Combo")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formBundle === "Combo" && styles.segmentTextActive,
                    ]}
                  >
                    Combo
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            placeholder="Restock schedule, peg locations, specific details..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            value={formNotes}
            onChangeText={setFormNotes}
          />
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            style={styles.saveBtnGradient}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {editingId ? "UPDATE LOCATION" : "SAVE LOCATION"}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.mainWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        barStyle={view === "radar" ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {view === "radar" && (
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&q=80&w=1000",
          }}
          style={styles.heroBackground}
        >
          <LinearGradient
            colors={["rgba(17, 24, 39, 0.7)", "rgba(31, 41, 55, 0.98)"]}
            style={styles.heroGradient}
          >
            <SafeAreaView
              edges={["top"]}
              style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 30 }}
            >
              <View style={styles.headerContent}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Feather
                    name={
                      locationStatus === "active"
                        ? "navigation"
                        : "navigation-2"
                    }
                    size={14}
                    color={
                      locationStatus === "active"
                        ? COLORS.success
                        : COLORS.inactive
                    }
                  />
                  <Text
                    style={[
                      styles.headerSubtitle,
                      {
                        color:
                          locationStatus === "active"
                            ? "#fff"
                            : COLORS.inactive,
                      },
                    ]}
                  >
                    {locationStatus === "active"
                      ? " Radar Active"
                      : " Radar Inactive"}
                  </Text>
                </View>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Diecast Radar</Text>
                </View>

                <View style={styles.heroTabs}>
                  <TouchableOpacity
                    style={styles.heroTabBtn}
                    onPress={() => handleTabSwitch("nearby")}
                  >
                    <View style={styles.heroTabLabelRow}>
                      <Text
                        style={[
                          styles.heroTabText,
                          viewMode === "nearby" && styles.heroTabTextActive,
                        ]}
                      >
                        Nearby
                      </Text>
                      {viewMode === "nearby" && !isLoading && (
                        <View style={styles.heroTabCount}>
                          <Text style={styles.heroTabCountText}>
                            {filteredStores.length}
                          </Text>
                        </View>
                      )}
                    </View>
                    {viewMode === "nearby" && (
                      <View style={styles.heroTabIndicator} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.heroTabBtn}
                    onPress={() => handleTabSwitch("all")}
                  >
                    <View style={styles.heroTabLabelRow}>
                      <Text
                        style={[
                          styles.heroTabText,
                          viewMode === "all" && styles.heroTabTextActive,
                        ]}
                      >
                        All Stores
                      </Text>
                      {viewMode === "all" && !isLoading && (
                        <View style={styles.heroTabCount}>
                          <Text style={styles.heroTabCountText}>
                            {filteredStores.length}
                          </Text>
                        </View>
                      )}
                    </View>
                    {viewMode === "all" && (
                      <View style={styles.heroTabIndicator} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </ImageBackground>
      )}

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {view === "radar" ? renderRadarBoard() : renderAddForm()}
      </KeyboardAvoidingView>

      {/* --- BOTTOM SHEET MENU MODAL --- */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalStoreName} numberOfLines={1}>
              {selectedStore?.name}
            </Text>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setModalVisible(false);
                if (selectedStore) {
                  Share.share({
                    message: buildStoreShareMessage(selectedStore),
                  });
                }
              }}
            >
              <View style={styles.modalIconBg}>
                <Feather name="share-2" size={18} color={COLORS.text} />
              </View>
              <Text style={styles.modalOptionText}>Share Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setModalVisible(false);
                handleEdit(selectedStore);
              }}
            >
              <View style={styles.modalIconBg}>
                <Feather name="edit-2" size={18} color={COLORS.text} />
              </View>
              <Text style={styles.modalOptionText}>Edit Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalOption, { borderBottomWidth: 0 }]}
              onPress={() =>
                promptDelete(selectedStore?.id, selectedStore?.name)
              }
            >
              <View
                style={[styles.modalIconBg, { backgroundColor: "#FFF0F0" }]}
              >
                <Feather name="trash-2" size={18} color={COLORS.primary} />
              </View>
              <Text style={[styles.modalOptionText, { color: COLORS.primary }]}>
                Delete Store
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* --- MODERN DELETE CONFIRMATION MODAL --- */}
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
              Are you sure you want to remove "{storeToDelete?.name}"? This
              action cannot be undone.
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
                onPress={executeDelete}
              >
                <Text style={styles.deleteConfirmBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
  },

  heroBackground: { width: "100%", height: 260 },
  heroGradient: { flex: 1, paddingHorizontal: 20 },
  headerContent: { width: "100%" },
  headerSubtitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 32,
    color: "#fff",
    letterSpacing: -1,
  },

  heroTabs: { flexDirection: "row", gap: 24, marginTop: 24 },
  heroTabBtn: { position: "relative", paddingBottom: 8 },
  heroTabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroTabCount: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  heroTabCountText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  heroTabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(255,255,255,0.6)",
  },
  heroTabTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },
  heroTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },

  radarContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingTop: 20,
  },

  filterCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  filterDrawerBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  filterDrawerText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },
  filterDrawerContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },

  searchInput: {
    fontFamily: "Poppins_500Medium",
    backgroundColor: COLORS.tagBg,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sliderLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  sliderValue: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 13,
    color: COLORS.primary,
  },
  filterGroupLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 10,
  },
  filterRow: { flexDirection: "row", gap: 8 },
  filterPill: {
    backgroundColor: COLORS.tagBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  filterPillActive: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  filterPillTextActive: {
    color: COLORS.primary,
    fontFamily: "Poppins_600SemiBold",
  },

  storeList: {
    flex: 1,
  },
  storeListContent: {
    paddingTop: 10,
    paddingBottom: 100,
    paddingHorizontal: 8,
  },

  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    marginHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },

  instamartBtn: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFF0F0",
    borderWidth: 0,
    borderColor: "#FECACA",
    borderRadius: 12,
    overflow: "hidden",
  },
  instamartBtnPlus: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  cardNotesBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.tagBg,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  cardNotesText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
  },

  cardDivider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 14,
  },

  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 },

  tag: {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  tagText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: COLORS.accent,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  tagInfo: {
    backgroundColor: COLORS.tagBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  tagInfoText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: COLORS.textMuted,
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  emptyText: {
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
    color: COLORS.textMuted,
    marginTop: 40,
    fontSize: 15,
  },

  emptyStateContainer: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 8,
  },
  retryBtn: {
    backgroundColor: COLORS.tagBg,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  retryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: COLORS.primary,
  },

  moreBtn: { padding: 4 },

  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },

  formView: { flex: 1, backgroundColor: COLORS.bg },
  formHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
  },
  backBtn: { padding: 4 },
  formTitle: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 16,
    color: COLORS.text,
    textTransform: "uppercase",
  },
  formScroll: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  formCard: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  label: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    fontFamily: "Poppins_500Medium",
    backgroundColor: COLORS.tagBg,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },

  mapsSearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.tagBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  mapsInput: {
    fontFamily: "Poppins_500Medium",
    flex: 1,
    padding: 14,
    color: COLORS.text,
    fontSize: 14,
  },
  mapResultsBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
  },
  mapResultItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  mapResultName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: COLORS.text,
  },
  mapResultAddress: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  captureText: {
    fontFamily: "Poppins_700Bold",
    color: COLORS.primary,
    fontSize: 13,
  },

  checkboxRow: { flexDirection: "row", gap: 12 },
  checkboxContainer: {
    flex: 1,
    backgroundColor: COLORS.tagBg,
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  customCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
  },
  customCheckActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },

  segmentContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.tagBg,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontFamily: "Poppins_600SemiBold",
    color: COLORS.textMuted,
    fontSize: 13,
  },
  segmentTextActive: { color: COLORS.text },

  saveBtnGradient: {
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBtnText: {
    fontFamily: "Poppins_800ExtraBold",
    color: "#fff",
    fontSize: 15,
    letterSpacing: 0.5,
  },

  // --- MODAL STYLES ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 44,
    height: 5,
    backgroundColor: COLORS.tagBorder,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalStoreName: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 24,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    gap: 16,
  },
  modalIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.tagBg,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOptionText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },

  // --- DELETE CONFIRMATION MODAL STYLES ---
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
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
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
    textAlign: "center",
  },
  confirmText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmBtnRow: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.tagBg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.tagBorder,
  },
  cancelBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  deleteConfirmBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
