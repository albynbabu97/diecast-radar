import { Linking, Platform } from 'react-native';
import type { Store } from '@/types/store';

type MapLocation = {
  name: string;
  lat: number | string;
  lng: number | string;
};

// Deep link for opening native maps on the current device (navigation button).
export const getStoreMapUrl = (item: MapLocation) => {
  const query = `${item.lat},${item.lng}(${item.name})`;
  return Platform.select({
    ios: `maps:0,0?q=${encodeURIComponent(query)}`,
    android: `geo:0,0?q=${encodeURIComponent(query)}`,
    default: getStoreShareMapUrl(item),
  })!;
};

// Universal HTTPS link for share sheets — works for any recipient on any device.
export const getStoreShareMapUrl = (item: MapLocation) => {
  const query = `${item.lat},${item.lng}(${item.name})`;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
};

export const openStoreInMaps = (item: Pick<Store, 'name' | 'lat' | 'lng'>) => {
  if (!item?.lat || !item?.lng) return;
  Linking.openURL(getStoreMapUrl(item));
};

export const buildStoreShareMessage = (store: Store) => {
  const name = store.name || '';
  const address = store.address ? `\nAddress: ${store.address}` : '';
  const mapUrl =
    store.lat && store.lng
      ? `\nLocation: ${getStoreShareMapUrl(store)}`
      : '';

  const availableItems: string[] = [];
  if (store.hotwheels) availableItems.push('Hot Wheels');
  if (store.matchbox) availableItems.push('Matchbox');
  if (store.other) availableItems.push('Other');
  const available = availableItems.length
    ? `\nAvailable: ${availableItems.join(', ')}`
    : '';

  const formatText = store.bundle ? `\nPack: ${store.bundle}` : '';
  const price = store.price ? `\nPrice: ${store.price}` : '';

  return (
    `Diecast stock at ${name}` +
    address +
    mapUrl +
    available +
    formatText +
    price
  );
};
