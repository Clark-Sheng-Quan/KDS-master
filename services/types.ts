export interface OrderSearchResponse {
  max_page: number;
  orders: string[];
  status_code: number;
  
}

export interface OrderDetailResponse {
  status_code: number;
  order_id: string;
  pick_method: string;
  pick_time: string;
  order_num: number | string;
  products: string[];  // 产品 ID 数组
  qtys: number[];     // 对应的数量数组
}

export interface OrderSearchParams {
  query: {
    time: [string, string];
  };
  detail: boolean;
  page_size: number;
  page_idx: number;
}

export interface OrderDetailParams {
  token: string;
  order_id: string;
}

export interface ProductDetailResponse {
  name: string;
  product_id: string;
  status_code: number;
  prepare_time?: number; // 直接从根级获取 prepare_time
  active?: boolean;
  business_id?: string;
  calorie?: number;
  category?: string[];
  description?: string;
  image_urls?: string[];
  options?: any[];
  price?: number;
  pricing_unit?: string;
  sku?: string;
  suffix?: Array<{name: string; is_visible: boolean}>;
  tax_required?: boolean;
}

export interface OrderOption {
  name: string;
  value: string;
  price: number;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price?: number;
  category?: string;
  options?: OrderOption[];
  prepare_time?: number;
}

export interface FormattedOrder {
  _id: string;
  id: string;
  orderId?: string;
  orderTime: string;
  pickupMethod: string;
  pickupTime: string;
  tableNumber?: string;
  order_num?: number | string;
  status?: string;
  source?: string;
  products: OrderItem[];
  total_prepare_time?: number;
  targetCategory?: string;
} 