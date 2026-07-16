export type Store = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  notes?: string;
  hotwheels: boolean;
  matchbox: boolean;
  other?: boolean;
  price?: 'MRP' | 'Custom';
  bundle?: 'Single' | 'Combo';
  distance?: number;
  address?: string;
};
