export interface Product {
  id: number;
  name: string;
  stock: number;
  unit_price: number;
  last_charge_date: string | null;
  created_at: string;
}

export interface Movement {
  id: number;
  product_id: number;
  product_name?: string;
  type: 'CARICO' | 'SCARICO';
  quantity: number;
  supplier?: string;
  requester?: string;
  destination?: string;
  movement_date: string;
  created_at: string;
}