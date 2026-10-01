import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerCompanyCrudTests } from './suites/company.suite';

describe('Company CRUD', () => {
  withPglite();
  registerCompanyCrudTests();
});
