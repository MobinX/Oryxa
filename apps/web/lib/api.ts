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
export const createBusiness = (token: string, data: Record<string, unknown>) =>
  apiFetch<{ id: string; userId: string; name: string }>('/api/v1/businesses', {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });

export const getBusiness = (token: string, id: string) =>
  apiFetch<Record<string, unknown>>(`/api/v1/businesses/${id}`, { token });

// Products
export const listProducts = (token: string, businessId: string) =>
  apiFetch<{ products: Array<Record<string, unknown>>; totalCount: number }>(
    `/api/v1/${businessId}/products`,
    { token },
  );

export const createProduct = (token: string, businessId: string, data: Record<string, unknown>) =>
  apiFetch<{ id: string; slug: string; variantCount: number }>(
    `/api/v1/${businessId}/products`,
    { method: 'POST', token, body: JSON.stringify(data) },
  );

export const listCategories = (token: string, businessId: string) =>
  apiFetch<Array<{ id: string; name: string; slug: string }>>(
    `/api/v1/${businessId}/categories`,
    { token },
  );

// Channels & Agents
export const listChannels = (token: string, businessId: string) =>
  apiFetch<Array<{ id: string; platform: string; platformChannelId: string; agentId: string | null }>>(
    `/api/v1/${businessId}/channels`,
    { token },
  );

export const getFacebookAuthUrl = (token: string, businessId: string) =>
  apiFetch<{ url: string }>(`/api/v1/${businessId}/channels/facebook/auth`, { token });

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
  apiFetch<Array<{ id: string; name: string; platformType: string; systemPrompt?: string }>>(
    `/api/v1/${businessId}/agents`,
    { token },
  );

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
export const listConversations = (token: string, businessId: string) =>
  apiFetch<
    Array<{ id: string; customerName: string | null; lastMessageState: string; channelId: string }>
  >(`/api/v1/${businessId}/conversations`, { token });

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
export const listOrders = (token: string, businessId: string) =>
  apiFetch<
    Array<{ id: string; customerName: string; totalPrice: number; state: string; createdAt: string }>
  >(`/api/v1/${businessId}/orders`, { token });

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
