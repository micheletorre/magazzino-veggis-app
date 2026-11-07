export interface Prodotto {
  id?: string | number;
  name: string;
  stock: number;
  quantity?: number;
  category?: string;
  supplier?: string | null;
  unit_price?: number;
  last_charge_date?: string | null;
  [key: string]: any;
}

export type Product = Prodotto;

export interface Movement {
  id?: string | number;
  product_id?: string | number;
  type: 'in' | 'out' | 'CARICO' | 'SCARICO' | string;
  quantity: number;
  date?: string;
  movement_date?: string;
  supplier?: string | null;
  destination?: string | null;
  requester?: string | null;
  unit_price?: number;
  [key: string]: any;
}
