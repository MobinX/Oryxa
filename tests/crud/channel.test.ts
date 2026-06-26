import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerChannelCrudTests } from './suites/channel.suite';

describe('Channel & Agent CRUD', () => {
  withPglite();
  registerChannelCrudTests();
});
