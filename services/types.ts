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
  notes?: string;                      // Item-level notes (from TCP/POS)
  suffix?: Array<{name: string; is_visible: boolean}>; // Suffix information
}

export interface FormattedOrder {
  _id: string;                           // MongoDB ObjectId (实际订单ID，用于API)
  id: string;                            // 同 _id (保留兼容性)
  orderId?: string;                      // 可选：同 _id
  num: number | string;                  // 订单号 (用于显示，来自order_num)
  orderTime: string;
  pickupMethod: string;
  pickupTime: string;
  kdsReceiveTime: string;                // KDS接收到订单的时间 (用于计时器的起始时间)
  originalKdsReceiveTime?: string;       // 原始 KDS 接收时间 (订单被召回时保留原始时间，用于计算完成耗时)
  tableNumber?: string;
  status?: string;
  source?: string;
  notes?: string;
  isRecalled?: boolean;                  // 标记是否为撤回的订单
  products: OrderItem[];
  total_prepare_time?: number;
  targetCategory?: string;
  updatedAt?: number;                    // 更新时间戳
  updateCount?: number;                  // 全局更新次数 (所有分类)
  completedItemIds?: string[];           // 整单模式下，记录已点完成的 item（用于撤回后恢复勾选状态）
}

export interface CompletedOrderItem extends OrderItem {
  completionKey: string;                 // 每个完成记录的唯一键（同名/同ID也可区分）
  completedAt: string;                   // 该 item 的最终完成时间（ISO）
  completedElapsedSeconds?: number;      // 该 item 完成耗时（开始到完成，秒）
  sourceItemId?: string;                 // 原始 item.id（用于追踪）
}

export interface CompletedOrder {
  order: FormattedOrder;
  completedAt: string;                   // 完成时间 (ISO 格式)
  completedItems: CompletedOrderItem[];  // 完成的 items 列表（用于显示和 recall）
} 