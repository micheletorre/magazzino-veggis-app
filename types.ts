export interface Prodotto {
  id?: string;
  name: string;
  quantity: number;
  category?: string;
  supplier?: string;
  unit_price?: number;
  [key: string]: any;
}

export type Product = Prodotto;

export interface Movement {
  id?: string;
  product_id?: string;
  type: 'in' | 'out' | 'CARICO' | 'SCARICO' | string;
  quantity: number;
  date?: string;
  [key: string]: any;
}