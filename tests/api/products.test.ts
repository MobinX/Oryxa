import { describe, it, expect, vi } from 'vitest';
import { productsRouter } from '@api/routes/products';

vi.mock('@repo/db/crud/product', () => ({
  createProduct: vi.fn(),
  getProductById: vi.fn(),
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock('@api/middleware/auth', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@api/middleware/business', () => ({
  businessAccessMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));

import * as productCrud from '@repo/db/crud/product';

describe('Product API Routes', () => {
  it('POST /products - should return 201 on valid payload', async () => {
    const mockId = '11111111-2222-3333-4444-555555555555';
    vi.mocked(productCrud.createProduct).mockResolvedValueOnce({
      id: mockId,
      slug: 'test-product',
      variantCount: 0,
    });

    const businessId = '123e4567-e89b-12d3-a456-426614174000';
    const req = new Request(`http://localhost/${businessId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Quantum Radar Schematic PDF',
        price: 19.99,
        sku: 'QR-PDF-01',
        variants: [],
      }),
    });

    const res = await productsRouter.request(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe(mockId);
  });

  it('GET /products/:productId - should return 404 if product does not exist', async () => {
    vi.mocked(productCrud.getProductById).mockResolvedValueOnce(null);

    const businessId = '123e4567-e89b-12d3-a456-426614174000';
    const productId = '99999999-9999-9999-9999-999999999999';
    const req = new Request(`http://localhost/${businessId}/products/${productId}`);
    const res = await productsRouter.request(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Product entity missing');
  });
});
