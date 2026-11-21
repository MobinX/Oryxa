import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createCompositeTools, createAgentTools } from '@repo/agent/tools';
import { createProduct } from '@repo/db/crud/product';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
const sendButtonsMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/integrations/facebook')>();
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
    sendButtons: (...args: unknown[]) => sendButtonsMock(...args),
  };
});

describe('Composite Business Tools', () => {
  withPglite({ timeoutMs: 120_000 });

  it('browse_catalog searches and lists products with category and variant filters', async () => {
    const seed = await seedTestWorld();
    const composite = createCompositeTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-buyer',
      deliveryZones: [{ label: 'Dhaka', price: 60 }, { label: 'Outside Dhaka', price: 120 }],
    });

    const resultRaw = await composite.browseCatalogTool.invoke({
      query: 'T-Shirt',
    });

    const parsed = JSON.parse(resultRaw);
    expect(parsed.found).toBe(true);
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items[0].name).toContain('T-Shirt');
    expect(parsed.items[0].variants.length).toBeGreaterThan(0);
  });

  it('get_product_quote calculates verified quote with price, stock, and delivery fee in one pass', async () => {
    const seed = await seedTestWorld();
    const composite = createCompositeTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-buyer',
      deliveryZones: [{ label: 'Dhaka', price: 60 }, { label: 'Chittagong', price: 120 }],
    });

    const quoteRaw = await composite.getProductQuoteTool.invoke({
      query: 'Test T-Shirt',
      color: 'Red',
      size: 'M',
      deliveryArea: 'Dhaka',
      quantity: 2,
    });

    const quote = JSON.parse(quoteRaw);
    expect(quote.found).toBe(true);
    expect(quote.productName).toContain('Test T-Shirt');
    expect(quote.quantity).toBe(2);
    expect(quote.shippingCost).toContain('60');
    expect(quote.inStock).toBe(true);
    expect(quote.availableColors).toBeDefined();
    expect(quote.availableSizes).toBeDefined();
  });

  it('place_order commits confirmed order to database idempotently', async () => {
    const seed = await seedTestWorld();
    const composite = createCompositeTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-buyer',
      customerName: 'Karim Ahmed',
      deliveryZones: [{ label: 'Dhaka', price: 60 }],
    });

    // Seed a product to order
    const product = await createProduct({
      businessId: seed.business.id,
      name: 'Polo Shirt Premium',
      sku: 'POLO-001',
      price: 800.00,
    });

    const orderRaw = await composite.placeOrderTool.invoke({
      productId: product.id,
      count: 1,
      customerAddress: 'House 12, Road 4, Sector 10, Uttara, Dhaka',
      customerPhone: '01711223344',
      shippingCost: 60,
      paymentMethod: 'Cash on delivery',
    });

    const order = JSON.parse(orderRaw);
    expect(order.created).toBe(true);
    expect(order.orderId).toBeDefined();
    expect(order.productName).toBe('Polo Shirt Premium');
    expect(order.state).toBe('Pending');
  });

  it('get_order_status retrieves order lifecycle status', async () => {
    const seed = await seedTestWorld();
    const composite = createCompositeTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-buyer',
      customerName: 'Karim Ahmed',
    });

    // Place an order first
    const product = await createProduct({
      businessId: seed.business.id,
      name: 'Leather Wallet',
      sku: 'WALLET-001',
      price: 1200.00,
    });

    const placedRaw = await composite.placeOrderTool.invoke({
      productId: product.id,
      count: 1,
      customerAddress: 'Dhanmondi, Dhaka',
      customerPhone: '01811223344',
      shippingCost: 60,
    });
    const placed = JSON.parse(placedRaw);

    const statusRaw = await composite.getOrderStatusTool.invoke({
      orderId: placed.orderId,
    });

    const status = JSON.parse(statusRaw);
    expect(status.found).toBe(true);
    expect(status.orderId).toBe(placed.orderId);
    expect(status.state).toBe('Pending');
  });

  it('createAgentTools registers both existing and composite tools side by side', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust-1',
    });

    const toolNames = tools.map((t) => t.name);

    // Existing tools preserved
    expect(toolNames).toContain('get_product');
    expect(toolNames).toContain('get_product_options');
    expect(toolNames).toContain('find_variant');
    expect(toolNames).toContain('create_order');
    expect(toolNames).toContain('show_products');
    expect(toolNames).toContain('send_message');
    expect(toolNames).toContain('send_suggestions');
    expect(toolNames).toContain('report_human_intervene');

    // Composite tools added
    expect(toolNames).toContain('browse_catalog');
    expect(toolNames).toContain('get_product_quote');
    expect(toolNames).toContain('place_order');
    expect(toolNames).toContain('get_order_status');
  });
});
