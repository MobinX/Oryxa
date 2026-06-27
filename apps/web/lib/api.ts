import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      redirect('/login?clear=true');
    }
    throw new ApiError(err.error ?? 'Request failed', res.status);
  }
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
  name: string;
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
};

export const getBusinessStats = (token: string, businessId: string) =>
  apiFetch<BusinessStats>(`/api/v1/businesses/${businessId}/stats`, { token });

export const updateBusiness = (token: string, id: string, data: Record<string, unknown>) =>
  apiFetch<{ success: boolean }>(`/api/v1/businesses/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(data),
  });

export const deleteBusiness = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/businesses/${id}`, { method: 'DELETE', token });

// Categories
export type Category = { id: string; name: string; slug: string };

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
    // B2 not configured or upload rejected — return null so the product can
    // still be saved without the image instead of failing the whole request.
    if (res.status === 503 || res.status === 400) return null;
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
