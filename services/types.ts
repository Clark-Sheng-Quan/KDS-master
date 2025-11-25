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
  itemState?: 'PROCESSED' | 'VOIDED'; // POS item state
  isUpdated?: boolean;                 // 标记此item是否在本次订单更新中被修改或新增
  isValidKds?: boolean;                // POS标记：此item是否对当前KDS有效 (true才处理，false或无值则跳过)
}

export interface FormattedOrder {
  _id: string;                           // MongoDB ObjectId (实际订单ID，用于API)
  id: string;                            // 同 _id (保留兼容性)
  orderId?: string;                      // 可选：同 _id
  num: number | string;                  // 订单号 (用于显示，来自order_num)
  orderTime: string;
  pickupMethod: string;
  pickupTime: string;
  tableNumber?: string;
  status?: string;
  source?: string;
  isRecalled?: boolean;                  // 标记是否为撤回的订单
  products: OrderItem[];
  total_prepare_time?: number;
  targetCategory?: string;
  updatedAt?: number;                    // 更新时间戳
  updateCount?: number;                  // 全局更新次数 (所有分类)
} 