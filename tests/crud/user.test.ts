import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerUserCrudTests } from './suites/user.suite';

describe('User CRUD', () => {
  withPglite();
  registerUserCrudTests();
});
