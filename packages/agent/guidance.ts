import { COMMENT_AGENT_GUIDANCE, MESSENGER_AGENT_GUIDANCE } from '@repo/shared';

/** Channel-specific instructions shared by live runs and the agent playground. */
export const DEFAULT_REPLY_GUIDANCE = MESSENGER_AGENT_GUIDANCE;
export const COMMENT_REPLY_GUIDANCE = COMMENT_AGENT_GUIDANCE;
