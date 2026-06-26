import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerOrderCrudTests } from './suites/order.suite';

describe('Order CRUD', () => {
  withPglite();
  registerOrderCrudTests();
});
