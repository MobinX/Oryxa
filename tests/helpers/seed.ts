import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import { createProduct, getProductById } from '@repo/db/crud/product';
import { createAgent, createChannel } from '@repo/db/crud/channel';
import { getOrCreateConversation } from '@repo/db/crud/conversation';

export const TEST_FIREBASE_UID = 'dev-test-uid';
export const TEST_AUTH_TOKEN = 'dev-test-token';

export type TestSeed = {
  user: Awaited<ReturnType<typeof syncUser>>;
  business: Awaited<ReturnType<typeof createBusiness>>;
  product: Awaited<ReturnType<typeof createProduct>>;
  productDetail: NonNullable<Awaited<ReturnType<typeof getProductById>>>;
  agent: Awaited<ReturnType<typeof createAgent>>;
  channel: Awaited<ReturnType<typeof createChannel>>;
  conversation: Awaited<ReturnType<typeof getOrCreateConversation>>;
  pageChannelId: string;
};

export async function seedTestWorld(): Promise<TestSeed> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await syncUser({
    firebaseUid: TEST_FIREBASE_UID,
    name: 'Test User',
    email: 'test@oryxa.dev',
    signInMethod: 'google',
  });

  const business = await createBusiness(user.id, {
    name: `Test Store ${suffix}`,
    description: 'A test e-commerce store',
    hasTradeLicense: false,
    hasTaxLicense: false,
  });

  const product = await createProduct({
    businessId: business.id,
    name: 'Test T-Shirt',
    price: 29.99,
    sku: `TS-${suffix}`,
    description: 'A comfortable cotton t-shirt',
    categoryName: 'Apparel',
    variants: [{ name: 'Red M', stock: 10, isAvailable: true, price: 29.99 }],
  });

  const productDetail = await getProductById(business.id, product.id);
  if (!productDetail) throw new Error('Failed to seed product');

  const agent = await createAgent(business.id, {
    name: 'Sales Bot',
    systemPrompt: 'You are a helpful sales assistant.',
    platformType: 'facebook',
  });

  const pageChannelId = `PAGE_${crypto.randomUUID()}`;

  const channel = await createChannel(business.id, {
    platform: 'facebook',
    apiToken: 'page-token-test',
    platformChannelId: pageChannelId,
    agentId: agent.id,
  });

  const conversation = await getOrCreateConversation(
    business.id,
    channel.id,
    'CUSTOMER_FB_ID',
    'Test Customer',
  );

  return { user, business, product, productDetail, agent, channel, conversation, pageChannelId };
}

export function authHeaders(token = TEST_AUTH_TOKEN) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
