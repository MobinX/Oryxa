import { describe } from 'vitest';
import { withNeon, getNeonDatabaseUrl } from '../helpers/with-neon';
import { registerUserCrudTests } from '../crud/suites/user.suite';
import { registerBusinessCrudTests } from '../crud/suites/business.suite';
import { registerProductCrudTests } from '../crud/suites/product.suite';
import { registerOrderCrudTests } from '../crud/suites/order.suite';
import { registerChannelCrudTests } from '../crud/suites/channel.suite';
import { registerConversationCrudTests } from '../crud/suites/conversation.suite';

const neonUrl = getNeonDatabaseUrl();

describe.skipIf(!neonUrl)('Neon CRUD — User', () => {
  withNeon();
  registerUserCrudTests();
});

describe.skipIf(!neonUrl)('Neon CRUD — Business', () => {
  withNeon();
  registerBusinessCrudTests();
});

describe.skipIf(!neonUrl)('Neon CRUD — Product', () => {
  withNeon();
  registerProductCrudTests();
});

describe.skipIf(!neonUrl)('Neon CRUD — Order', () => {
  withNeon();
  registerOrderCrudTests();
});

describe.skipIf(!neonUrl)('Neon CRUD — Channel & Agent', () => {
  withNeon();
  registerChannelCrudTests();
});

describe.skipIf(!neonUrl)('Neon CRUD — Conversation', () => {
  withNeon();
  registerConversationCrudTests();
});
