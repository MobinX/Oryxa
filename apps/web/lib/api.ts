import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /**
     * The parsed error body. Most failures only carry `error`, and the message is enough —
     * but a 409 that names the rows in the way puts that list beside the message, not in it.
     */
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; signInPath?: string | null } = {},
): Promise<T> {
  const { token, signInPath, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${baseUrl}${cleanPath}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      // `null` says the caller signs the redirect itself: a route with its own
      // sign-in page must not bounce the reader to the app's.
      if (signInPath === null) throw new ApiError(err.error ?? 'Request failed', res.status, err);
      redirect(signInPath ?? '/login?clear=true');
    }
    throw new ApiError(err.error ?? 'Request failed', res.status, err);
  }
  // A 204 has no body to parse, and `res.json()` on it rejects rather than returning null.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// User
export const syncUser = (data: {
  firebaseUid: string;
  name: string;
  email?: string;
  signInMethod: string;
}) => apiFetch('/api/v1/users/sync', { method: 'POST', body: JSON.stringify(data) });

export const getMe = (token: string) =>
  apiFetch<{ id: string; name: string; email: string | null }>('/api/v1/users/me', { token });

// Business
export type Business = {
  id: string;
  userId: string;
  companyId?: string | null;
  name: string;
  slug?: string | null;
  storePublished?: boolean;
  storeTheme?: {
    accentColor?: string;
    font?: 'sans' | 'serif' | 'mono';
    tagline?: string;
    heroImageUrl?: string;
    logoUrl?: string;
    layout?: 'grid' | 'featured';
    preset?: 'gallery' | 'pine' | 'terracotta' | 'petrol' | 'atelier';
    structure?: 'classic' | 'editorial' | 'market' | 'terminal' | 'atelier';
  } | null;
  description?: string | null;
  employeeCount?: number | null;
  type?: string | null;
  foundedDate?: string | null;
  hasTradeLicense: boolean;
  hasTaxLicense: boolean;
  facebookPageLink?: string | null;
  phone?: string | null;
  createdAt: string;
};

export const listBusinesses = (token: string) =>
  apiFetch<{ businesses: Business[] }>('/api/v1/businesses', { token });

export const createBusiness = (token: string, data: Record<string, unknown>) =>
  apiFetch<{ id: string; userId: string; name: string }>('/api/v1/businesses', {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const getBusiness = (token: string, id: string) =>
  apiFetch<Business>(`/api/v1/businesses/${id}`, { token });

export type BusinessStats = {
  products: number;
  orders: number;
  channels: number;
  conversations: number;
  revenue: number;
  messages: number;
  avgResponseTime: number;
};

export const getBusinessStats = (token: string, businessId: string) =>
  apiFetch<BusinessStats>(`/api/v1/businesses/${businessId}/stats`, { token });

export const getBusinessAnalytics = (token: string, businessId: string, days: number = 30) =>
  apiFetch<any>(`/api/v1/businesses/${businessId}/analytics?days=${days}`, { token });

export const getTokenAnalytics = (token: string, businessId: string, hours: number = 24) =>
  apiFetch<any>(`/api/v1/${businessId}/analytics/tokens?hours=${hours}`, { token });

export const getTokenLogs = (token: string, businessId: string, limit: number = 50) =>
  apiFetch<any[]>(`/api/v1/${businessId}/analytics/tokens/logs?limit=${limit}`, { token });

export const searchBusiness = (token: string, businessId: string, query: string) =>
  apiFetch<any>(`/api/v1/businesses/${businessId}/search?q=${encodeURIComponent(query)}`, { token });



export const updateBusiness = (token: string, id: string, data: Record<string, unknown>) =>
  apiFetch<{ success: boolean }>(`/api/v1/businesses/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(data),
  });

export const deleteBusiness = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/businesses/${id}`, { method: 'DELETE', token });

export const hardDeleteBusiness = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/businesses/${id}/data`, { method: 'DELETE', token });


// Categories
export type Category = { id: string; name: string; slug: string; productCount?: number };

export const createCategory = (token: string, businessId: string, name: string) =>
  apiFetch<Category>(`/api/v1/${businessId}/categories`, {
    method: 'POST',
    token,
    body: JSON.stringify({ name }),
  });

export const updateCategory = (
  token: string,
  businessId: string,
  categoryId: string,
  name: string,
) =>
  apiFetch<{ updated: boolean }>(`/api/v1/${businessId}/categories/${categoryId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ name }),
  });

export const deleteCategory = (token: string, businessId: string, categoryId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/categories/${categoryId}`, {
    method: 'DELETE',
    token,
  });

// Products
export type ProductListItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  slug: string;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  variantCount?: number;
  thumbnailUrl?: string | null;
  createdAt: string;
};

export type ProductVariant = {
  id?: string;
  name: string;
  imageUrl?: string | null;
  imageKey?: string | null;
  imagePreviewUrl?: string;
  price?: number;
  stock: number;
  isAvailable?: boolean;
};

export type ProductDetail = {
  id: string;
  name: string;
  sku: string;
  price: number;
  description?: string | null;
  category: { id: string; name: string } | null;
  customerId?: string | null;
  customer: { id: string; name: string } | null;
  variants: Array<{
    id: string;
    name: string;
    imageUrl?: string | null;
    imageKey?: string | null;
    price?: number;
    stock: number;
    isAvailable: boolean;
  }>;
  createdAt: string;
};

export type CreateProductInput = {
  name: string;
  price: number;
  sku: string;
  description?: string;
  categoryName?: string;
  categoryId?: string;
  customerId?: string | null;
  variants?: Array<{
    name: string;
    imageUrl?: string;
    price?: number;
    stock: number;
    isAvailable?: boolean;
  }>;
};

export type UpdateProductInput = {
  name?: string;
  price?: number;
  sku?: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  customerId?: string | null;
  variants?: Array<{
    id?: string;
    name: string;
    imageUrl?: string;
    price?: number;
    stock: number;
    isAvailable?: boolean;
  }>;
};

export const listProducts = (
  token: string,
  businessId: string,
  params?: { categoryId?: string; limit?: number; offset?: number },
) => {
  const search = new URLSearchParams();
  if (params?.categoryId) search.set('categoryId', params.categoryId);
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.offset != null) search.set('offset', String(params.offset));
  const qs = search.toString();
  return apiFetch<{ products: ProductListItem[]; totalCount: number }>(
    `/api/v1/${businessId}/products${qs ? `?${qs}` : ''}`,
    { token },
  );
};

export const getProduct = (token: string, businessId: string, productId: string) =>
  apiFetch<ProductDetail>(`/api/v1/${businessId}/products/${productId}`, { token });

export const createProduct = (token: string, businessId: string, data: CreateProductInput) =>
  apiFetch<{ id: string; slug: string; variantCount: number }>(
    `/api/v1/${businessId}/products`,
    { method: 'POST', token, body: JSON.stringify(data) },
  );

export const updateProduct = (
  token: string,
  businessId: string,
  productId: string,
  data: UpdateProductInput,
) =>
  apiFetch<{ updated: boolean }>(`/api/v1/${businessId}/products/${productId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(data),
  });

export const deleteProduct = (token: string, businessId: string, productId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/products/${productId}`, {
    method: 'DELETE',
    token,
  });

export const listCategories = (token: string, businessId: string) =>
  apiFetch<Category[]>(`/api/v1/${businessId}/categories`, { token });

export async function uploadVariantImage(
  token: string,
  businessId: string,
  file: File,
): Promise<{ url: string; key: string } | null> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_URL}/api/v1/${businessId}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    // B2 not configured — return null so the product can
    // still be saved without the image instead of failing the whole request.
    if (res.status === 503) return null;
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? 'Upload failed', res.status);
  }

  return res.json() as Promise<{ url: string; key: string }>;
}

// Channels & Agents
export type Channel = {
  id: string;
  platform: string;
  platformChannelId: string;
  pageName?: string | null;
  agentId: string | null;
};

export type Agent = {
  id: string;
  name: string;
  platformType: string;
  systemPrompt?: string;
  createdAt?: string;
};

export const createChannel = (
  token: string,
  businessId: string,
  data: { platform: string; apiToken: string; platformChannelId: string; agentId?: string; extraInfo?: string },
) =>
  apiFetch<{ id: string; status: 'linked' }>(`/api/v1/${businessId}/channels`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const listChannels = (token: string, businessId: string) =>
  apiFetch<Channel[]>(`/api/v1/${businessId}/channels`, { token });

export const updateChannel = (
  token: string,
  businessId: string,
  channelId: string,
  data: { platform?: string; apiToken?: string; platformChannelId?: string; extraInfo?: string },
) =>
  apiFetch<{ id: string; updated: boolean }>(
    `/api/v1/${businessId}/channels/${channelId}`,
    { method: 'PUT', token, body: JSON.stringify(data) },
  );

export const deleteChannel = (token: string, businessId: string, channelId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/channels/${channelId}`, {
    method: 'DELETE',
    token,
  });

export const getFacebookAuthUrl = (token: string, businessId: string) =>
  apiFetch<{ url: string }>(`/api/v1/${businessId}/channels/facebook/auth`, { token });

export type FacebookPendingPage = {
  id: string;
  name: string;
  connected: boolean;
};

export const listFacebookPendingPages = (
  token: string,
  businessId: string,
  selectionToken: string,
) =>
  apiFetch<FacebookPendingPage[]>(
    `/api/v1/${businessId}/channels/facebook/pending?token=${encodeURIComponent(selectionToken)}`,
    { token },
  );

export const connectFacebookPages = (
  token: string,
  businessId: string,
  data: { token: string; pageIds: string[] },
) =>
  apiFetch<{
    connected: Array<{ id: string; pageId: string; pageName: string }>;
    skipped: string[];
    failed?: Array<{ pageId: string; error: string }>;
  }>(
    `/api/v1/${businessId}/channels/facebook/connect`,
    { method: 'POST', token, body: JSON.stringify(data) },
  );

export const createAgent = (
  token: string,
  businessId: string,
  data: { name: string; systemPrompt: string; platformType: string },
) =>
  apiFetch<{ id: string }>(`/api/v1/${businessId}/agents`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const listAgents = (token: string, businessId: string) =>
  apiFetch<Agent[]>(`/api/v1/${businessId}/agents`, { token });

export const getAgent = (token: string, businessId: string, agentId: string) =>
  apiFetch<Agent>(`/api/v1/${businessId}/agents/${agentId}`, { token });

export const updateAgent = (
  token: string,
  businessId: string,
  agentId: string,
  data: { name?: string; systemPrompt?: string; platformType?: string },
) =>
  apiFetch<{ id: string; updated: boolean }>(
    `/api/v1/${businessId}/agents/${agentId}`,
    { method: 'PUT', token, body: JSON.stringify(data) },
  );

export const deleteAgent = (token: string, businessId: string, agentId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/agents/${agentId}`, {
    method: 'DELETE',
    token,
  });

export const updateChannelAgent = (
  token: string,
  businessId: string,
  channelId: string,
  agentId: string | null,
) =>
  apiFetch<{ success: boolean }>(`/api/v1/${businessId}/channels/${channelId}/agent`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ agentId }),
  });

// Conversations
export type Conversation = {
  id: string;
  customerName: string | null;
  lastMessageState: string;
  channelId: string;
  customerPlatformId: string;
  createdAt: string;
  pageName?: string | null;
};

export const listConversations = (token: string, businessId: string) =>
  apiFetch<Conversation[]>(`/api/v1/${businessId}/conversations`, { token });

export const deleteConversation = (token: string, businessId: string, conversationId: string) =>
  apiFetch<{ deleted: boolean }>(
    `/api/v1/${businessId}/conversations/${conversationId}`,
    { method: 'DELETE', token },
  );

export const listMessages = (
  token: string,
  businessId: string,
  conversationId: string,
) =>
  apiFetch<Array<{ id: string; from: string; content: string; contentType: string; time: string }>>(
    `/api/v1/${businessId}/conversations/${conversationId}/messages`,
    { token },
  );

export const sendMessage = (
  token: string,
  businessId: string,
  conversationId: string,
  content: string,
) =>
  apiFetch<{ id: string; time: string }>(
    `/api/v1/${businessId}/conversations/${conversationId}/messages`,
    { method: 'POST', token, body: JSON.stringify({ content, contentType: 'text' }) },
  );

// Orders
export type OrderListItem = {
  id: string;
  customerName: string;
  totalPrice: number;
  state: string;
  createdAt: string;
};

export type OrderDetail = {
  id: string;
  businessId: string;
  productId: string | null;
  variantId: string | null;
  productName?: string | null;
  variantName?: string | null;
  variantImageUrl?: string | null;
  count: number;
  variantPrice: number;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  state: string;
  totalPrice: number;
  conversationId?: string | null;
  createdAt: string;
};

export const listOrders = (token: string, businessId: string) =>
  apiFetch<OrderListItem[]>(`/api/v1/${businessId}/orders`, { token });

export const getOrder = (token: string, businessId: string, orderId: string) =>
  apiFetch<OrderDetail>(`/api/v1/${businessId}/orders/${orderId}`, { token });

export const createOrder = (
  token: string,
  businessId: string,
  data: {
    productId: string;
    variantId?: string;
    count: number;
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
  },
) =>
  apiFetch<{ id: string; totalPrice: number; state: string }>(
    `/api/v1/${businessId}/orders`,
    { method: 'POST', token, body: JSON.stringify(data) },
  );

export const updateOrder = (
  token: string,
  businessId: string,
  orderId: string,
  data: {
    count?: number;
    customerName?: string;
    customerPhone?: string | null;
    customerAddress?: string | null;
    state?: string;
  },
) =>
  apiFetch<{ id: string; updated: boolean }>(
    `/api/v1/${businessId}/orders/${orderId}`,
    { method: 'PATCH', token, body: JSON.stringify(data) },
  );

export const deleteOrder = (token: string, businessId: string, orderId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/orders/${orderId}`, {
    method: 'DELETE',
    token,
  });

export const updateOrderState = (
  token: string,
  businessId: string,
  orderId: string,
  state: string,
) =>
  apiFetch<{ id: string; newState: string }>(
    `/api/v1/${businessId}/orders/${orderId}/state`,
    { method: 'PATCH', token, body: JSON.stringify({ state }) },
  );

// CSV export helpers (server-side only)
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (val: unknown): string => {
    const s = val == null ? '' : String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function csvColumnsForProducts() {
  return [
    { key: 'name', label: 'Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'price', label: 'Price' },
    { key: 'categoryName', label: 'Category' },
    { key: 'variantCount', label: 'Variants' },
    { key: 'description', label: 'Description' },
    { key: 'createdAt', label: 'Created At' },
  ];
}

export function csvColumnsForOrders() {
  return [
    { key: 'id', label: 'Order ID' },
    { key: 'customerName', label: 'Customer' },
    { key: 'totalPrice', label: 'Total' },
    { key: 'state', label: 'State' },
    { key: 'createdAt', label: 'Created At' },
  ];
}

// Posts
export type PostState = 'draft' | 'scheduled' | 'published' | 'failed';

export type PostSync = {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  reachCount: number;
  syncedAt: string;
};

export type Post = {
  id: string;
  channelId: string;
  productId?: string | null;
  content: string;
  mediaUrls?: string[] | null;
  postState: PostState;
  platformPostId?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
};

export type PostDetail = Post & {
  aiPrompt?: string | null;
  latestSync?: PostSync | null;
};

export const listPosts = (
  token: string,
  businessId: string,
  opts?: { channelId?: string; state?: PostState },
) => {
  const params = new URLSearchParams();
  if (opts?.channelId) params.append('channelId', opts.channelId);
  if (opts?.state) params.append('state', opts.state);
  const q = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<Post[]>(`/api/v1/${businessId}/posts${q}`, { token });
};

export const getPost = (token: string, businessId: string, postId: string) =>
  apiFetch<PostDetail>(`/api/v1/${businessId}/posts/${postId}`, { token });

export const createPost = (
  token: string,
  businessId: string,
  data: {
    channelId: string;
    content: string;
    mediaUrls?: string[];
    scheduledAt?: string | null;
    productId?: string | null;
  },
) =>
  apiFetch<Post>(`/api/v1/${businessId}/posts`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const updatePost = (
  token: string,
  businessId: string,
  postId: string,
  data: {
    channelId?: string;
    content?: string;
    mediaUrls?: string[];
    scheduledAt?: string | null;
    postState?: PostState;
    platformPostId?: string;
    aiPrompt?: string;
  },
) =>
  apiFetch<Post>(`/api/v1/${businessId}/posts/${postId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data),
  });

export const deletePost = (token: string, businessId: string, postId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/posts/${postId}`, {
    method: 'DELETE',
    token,
  });

export const publishPost = (token: string, businessId: string, postId: string) =>
  apiFetch<{ platformPostId: string; publishedAt: string }>(
    `/api/v1/${businessId}/posts/${postId}/publish`,
    {
      method: 'POST',
      token,
    },
  );

export const syncPost = (token: string, businessId: string, postId: string) =>
  apiFetch<PostSync>(`/api/v1/${businessId}/posts/${postId}/sync`, {
    method: 'POST',
    token,
  });

export const generatePost = (
  token: string,
  businessId: string,
  data: {
    channelId: string;
    productId: string;
    tone?: string;
  },
) =>
  apiFetch<Post>(`/api/v1/${businessId}/posts/generate`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const tunePost = (
  token: string,
  businessId: string,
  postId: string,
  instruction: string,
) =>
  apiFetch<Post>(`/api/v1/${businessId}/posts/${postId}/tune`, {
    method: 'POST',
    token,
    body: JSON.stringify({ instruction }),
  });

// Logs — the read-only observability surface, on /api2 rather than /api/v1
export type LogEventRow = {
  time: string;
  evt: string;
  fields: Record<string, unknown>;
};

export type LogQueryResult = {
  events: LogEventRow[];
  nextCursor?: string;
  window: { startTime: string; endTime: string };
  limit: number;
  /** `axiom` when ingest is configured, `memory` when this process is its own store. */
  source: 'axiom' | 'memory';
};

export type LogEventTypeOption = { evt: string; label: string };

export type LogFilter = {
  type?: string;
  start?: string;
  end?: string;
  limit?: number;
  cursor?: string;
};

export const getLogEvents = (token: string, filter: LogFilter) => {
  const params = new URLSearchParams();
  if (filter.type) params.set('type', filter.type);
  if (filter.start) params.set('start', filter.start);
  if (filter.end) params.set('end', filter.end);
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.cursor) params.set('cursor', filter.cursor);
  return apiFetch<LogQueryResult>(`/api2/logs?${params.toString()}`, { token, signInPath: null });
};

export const getLogEventTypes = (token: string) =>
  apiFetch<{ types: LogEventTypeOption[] }>('/api2/logs/types', { token, signInPath: null });

// Admin — the operator dashboard read, on /api2 beside the log query.
export type AdminWindowMetrics = {
  conversations: number;
  messages: number;
  inboundMessages: number;
  outboundMessages: number;
  orders: number;
  revenue: number;
  visits: number;
  llmTokens: number;
  estimatedCostUsd: number;
  agentRuns: number;
};

/** Lifetime counts, so the dashboard never shows a delta against them. */
export type AdminSnapshot = {
  users: number;
  businesses: number;
  publishedStores: number;
  channels: number;
  products: number;
};

export type AdminDailyPoint = {
  date: string;
  visits: number;
  conversations: number;
  messagesIn: number;
  messagesOut: number;
  orders: number;
  revenue: number;
  tokens: number;
  costUsd: number;
};

export type AdminTopBusiness = {
  id: string;
  name: string;
  slug: string | null;
  conversations: number;
  messages: number;
  orders: number;
  revenue: number;
};

export type AdminStats = {
  range: { days: number; tz: string; startTime: string; endTime: string };
  snapshot: AdminSnapshot;
  window: AdminWindowMetrics;
  previous: AdminWindowMetrics;
  daily: AdminDailyPoint[];
  topBusinesses: AdminTopBusiness[];
  /** `null` when the log store did not answer; every other number on the page still did. */
  anomalies: { errors: number; authRejections: number; cap: number } | null;
};

export const getAdminStats = (token: string, filter: { days?: number; tz?: string } = {}) => {
  const params = new URLSearchParams();
  if (filter.days) params.set('days', String(filter.days));
  if (filter.tz) params.set('tz', filter.tz);
  const query = params.toString();
  return apiFetch<AdminStats>(
    `/api2/admin/stats${query ? `?${query}` : ''}`,
    { token, signInPath: null },
  );
};

// Plans, allowances and notifications. `messageLimit` null and 0 are different things on
// every surface: null is uncapped, 0 stops the agent. Nothing here re-implements that.
export type PublicPlan = {
  name: string;
  slug: string;
  priceCents: number;
  currency: string;
  priceLabel: string;
  messageLimitLabel: string;
  commentLimitLabel: string;
  features: string[];
};

export type Plan = {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  currency: string;
  messageLimit: number | null;
  commentLimit: number | null;
  features: string[];
  position: number;
  active: boolean;
};

export type PlanInput = Omit<Plan, 'id'>;
export type UpdatePlanInput = Partial<PlanInput>;

/** A plan row plus the blast radius of editing it. */
export type AdminPlanRow = Plan & { businessCount: number };

export type AdminPlanEditResult = { plan: AdminPlanRow; notified: number };

export type DeletePlanConflict = {
  error: string;
  businesses: Array<{ id: string; name: string }>;
};

export type QuotaCycle = {
  period: string;
  startedAt: string;
  resetsAt: string;
  daysLeft: number;
};

export type QuotaStatus = {
  /** False when no plan is assigned — which means unlimited, not zero. */
  assigned: boolean;
  planId: string | null;
  planName: string | null;
  cycle: QuotaCycle;
  messageLimit: number | null;
  commentLimit: number | null;
  messagesUsed: number;
  commentsUsed: number;
  messageBlocked: boolean;
  commentBlocked: boolean;
};

export type BillingOverview = {
  businessId: string;
  quota: QuotaStatus;
  plan: Plan | null;
  options: Plan[];
};

export type NotificationItem = {
  id: string;
  kind:
    | 'message_quota_80'
    | 'message_quota_100'
    | 'comment_quota_80'
    | 'comment_quota_100'
    | (string & {});
  period: string | null;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationList = {
  notifications: NotificationItem[];
  unreadCount: number;
};

export type AdminBusinessPlan = {
  businessId: string;
  businessName: string;
  planId: string | null;
  planName: string | null;
  /** The cycle anchor: set at first assignment, never moved by a plan switch. */
  planStartedAt: string | null;
  period: string;
  messagesUsed: number;
  commentsUsed: number;
  messageLimit: number | null;
  commentLimit: number | null;
};

export type PlanAssignment = {
  id: string;
  businessId: string;
  planId: string | null;
  planName: string | null;
  previousPlanId: string | null;
  previousPlanName: string | null;
  actorKind: 'operator' | 'merchant' | 'system';
  actorUserId: string | null;
  createdAt: string;
};

export const listPublicPlans = () =>
  apiFetch<PublicPlan[]>('/api/v1/plans', { signInPath: null });

export const getBilling = (token: string, businessId: string) =>
  apiFetch<BillingOverview>(`/api/v1/${businessId}/billing`, { token });

/** Answers 409 with the merchant-readable reason when the plan is smaller than this cycle. */
export const switchPlan = (token: string, businessId: string, planId: string) =>
  apiFetch<Plan>(`/api/v1/${businessId}/billing/plan`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ planId }),
  });

export const listNotifications = (
  token: string,
  businessId: string,
  filter: { unreadOnly?: boolean } = {},
) =>
  apiFetch<NotificationList>(
    `/api/v1/${businessId}/notifications${filter.unreadOnly ? '?unread=true' : ''}`,
    { token },
  );

export const markNotificationsRead = (
  token: string,
  businessId: string,
  input: { ids?: string[]; all?: boolean },
) =>
  apiFetch<{ updated: number }>(`/api/v1/${businessId}/notifications/read`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });

// The operator surface. Every call below carries the log console's bearer, exactly like
// /api2/admin/stats, so a merchant's own token is never what authorises a plan edit.
export const adminListPlans = (token: string) =>
  apiFetch<AdminPlanRow[]>('/api2/admin/plans', { token, signInPath: null });

export const adminCreatePlan = (token: string, input: PlanInput) =>
  apiFetch<AdminPlanEditResult>('/api2/admin/plans', {
    method: 'POST',
    token,
    signInPath: null,
    body: JSON.stringify(input),
  });

export const adminUpdatePlan = (token: string, id: string, input: UpdatePlanInput) =>
  apiFetch<AdminPlanEditResult>(`/api2/admin/plans/${id}`, {
    method: 'PATCH',
    token,
    signInPath: null,
    body: JSON.stringify(input),
  });

/** Resolves to the conflict body while businesses are still on the plan; undefined means deleted. */
export const adminDeletePlan = (token: string, id: string) =>
  apiFetch<DeletePlanConflict | undefined>(`/api2/admin/plans/${id}`, {
    method: 'DELETE',
    token,
    signInPath: null,
  });

export const adminListBusinessPlans = (token: string) =>
  apiFetch<AdminBusinessPlan[]>('/api2/admin/plans/businesses', { token, signInPath: null });

export const adminAssignPlan = (token: string, businessId: string, planId: string | null) =>
  apiFetch<QuotaStatus>(`/api2/admin/businesses/${businessId}/plan`, {
    method: 'PUT',
    token,
    signInPath: null,
    body: JSON.stringify({ planId }),
  });

export const adminResetCycle = (token: string, businessId: string) =>
  apiFetch<QuotaStatus>(`/api2/admin/businesses/${businessId}/plan/reset`, {
    method: 'POST',
    token,
    signInPath: null,
  });

export const adminListAssignments = (token: string, businessId: string) =>
  apiFetch<PlanAssignment[]>(`/api2/admin/businesses/${businessId}/assignments`, {
    token,
    signInPath: null,
  });

// Companies
export type Company = {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  phone?: string | null;
  createdAt: string;
};

export type CreateCompanyInput = {
  name: string;
  description?: string;
  phone?: string;
};

export const listCompanies = (token: string) =>
  apiFetch<{ companies: Company[]; totalCount: number }>('/api/v1/companies', { token });

export const createCompany = (token: string, data: CreateCompanyInput) =>
  apiFetch<Company>('/api/v1/companies', { method: 'POST', token, body: JSON.stringify(data) });

export const updateCompany = (token: string, companyId: string, data: Partial<CreateCompanyInput>) =>
  apiFetch<{ success: boolean }>(`/api/v1/companies/${companyId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(data),
  });

export const deleteCompany = (token: string, companyId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/companies/${companyId}`, { method: 'DELETE', token });

export const getCompanyBusinesses = (token: string, companyId: string) =>
  apiFetch<{ businesses: Array<{ id: string; name: string }> }>(
    `/api/v1/companies/${companyId}/businesses`,
    { token },
  );

export const assignBusinessToCompany = (token: string, companyId: string, businessId: string) =>
  apiFetch<{ success: boolean }>(`/api/v1/companies/${companyId}/businesses`, {
    method: 'POST',
    token,
    body: JSON.stringify({ businessId }),
  });

export const unassignBusinessFromCompany = (
  token: string,
  companyId: string,
  businessId: string,
) =>
  apiFetch<{ success: boolean }>(`/api/v1/companies/${companyId}/businesses/${businessId}`, {
    method: 'DELETE',
    token,
  });

// Customers (scoped through the business's company)
export type Customer = {
  id: string;
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  avatar?: string | null;
  createdAt: string;
};

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  avatar?: string;
};

export const listCustomers = (token: string, businessId: string, search?: string, limit?: number) => {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (limit != null) qs.set('limit', String(limit));
  const suffix = qs.toString();
  return apiFetch<{ customers: Customer[]; totalCount: number }>(
    `/api/v1/${businessId}/customers${suffix ? `?${suffix}` : ''}`,
    { token },
  );
};

export const createCustomer = (token: string, businessId: string, data: CreateCustomerInput) =>
  apiFetch<Customer>(`/api/v1/${businessId}/customers`, {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const updateCustomer = (
  token: string,
  businessId: string,
  customerId: string,
  data: Partial<CreateCustomerInput>,
) =>
  apiFetch<{ success: boolean }>(`/api/v1/${businessId}/customers/${customerId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(data),
  });

export const deleteCustomer = (token: string, businessId: string, customerId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/${businessId}/customers/${customerId}`, {
    method: 'DELETE',
    token,
  });
