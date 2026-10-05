import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerCustomerCrudTests } from './suites/customer.suite';

describe('Customer CRUD', () => {
  withPglite();
  registerCustomerCrudTests();
});
