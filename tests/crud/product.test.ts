import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerProductCrudTests } from './suites/product.suite';

describe('Product CRUD', () => {
  withPglite();
  registerProductCrudTests();
});
