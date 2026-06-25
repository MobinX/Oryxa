import { describe } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { registerConversationCrudTests } from './suites/conversation.suite';

describe('Conversation CRUD', () => {
  withPglite();
  registerConversationCrudTests();
});
