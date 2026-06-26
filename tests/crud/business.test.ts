import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerBusinessCrudTests } from './suites/business.suite';

describe('Business CRUD', () => {
  withPglite();
  registerBusinessCrudTests();
});
