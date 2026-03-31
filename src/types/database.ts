export type Role = "admin" | "manager" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  /** false = cannot use dashboard (admin-controlled) */
  is_active?: boolean;
  created_by: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  stock_quantity: number;
  return_stock_quantity: number;
  min_stock_level: number | null;
  is_active: boolean;
  created_at: string;
};

export type ProductBatch = {
  id: string;
  product_id: string | null;
  supplier_id: string | null;
  order_id: string | null;
  quantity: number;
  remaining_quantity: number;
  purchase_date: string | null;
  expiration_date: string | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_info: string | null;
  created_at: string;
};

export type OrderRow = {
  id: string;
  supplier_id: string | null;
  status: "pending" | "received";
  created_by: string | null;
  created_at: string;
};

export type SaleRow = {
  id: string;
  receipt_number: string;
  created_by: string | null;
  created_at: string;
};

export type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  price: number;
  source_type?: "regular" | "return";
};

export type CartLine = {
  product_id: string;
  quantity: number;
  price: number;
};
