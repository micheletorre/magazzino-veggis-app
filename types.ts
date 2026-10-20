export interface Prodotto {
  id?: string;
  name: string;
  quantity: number;
  category?: string;
  supplier?: string;
  unit_price?: number;
  [key: string]: any; // Per accettare eventuali altre proprietà dinamiche
}