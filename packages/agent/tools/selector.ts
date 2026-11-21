/**
 * OnlyOrders — Dynamic TypeScript Tool Selector
 *
 * Dynamically binds a minimal, highly relevant subset of tools (2 to 4 tools)
 * based on the hybrid Jev + deterministic classification and conversation state.
 * Reduces tool definition token overhead by up to 80% while eliminating tool hallucination.
 */

import type { StructuredTool } from '@langchain/core/tools';
import type { ConversationAgentState, JevIntentCategory } from '@repo/shared';

export interface DynamicToolSelectorOptions {
  /** Detected intent categories from Jev / Hybrid classifier */
  intents: JevIntentCategory[];
  /** Durable conversation state */
  agentState?: ConversationAgentState | null;
  /** Complete registry of all registered LangChain tools */
  allTools: Record<string, StructuredTool>;
  /** Whether to prioritize composite tools (defaults to true) */
  enableCompositeTools?: boolean;
  /** Maximum tools to provide to GPT Luna in one turn (defaults to 4) */
  maxTools?: number;
  /** Whether the customer provided an image in the current exchange */
  hasImages?: boolean;
}

export function selectToolsForTurn(options: DynamicToolSelectorOptions): StructuredTool[] {
  const { intents, agentState, allTools, enableCompositeTools = true, maxTools = 4, hasImages = false } = options;
  const selectedToolNames = new Set<string>();

  // 1. If customer sent an image, ensure visual catalog search/quote tools are prioritized
  if (hasImages) {
    if (enableCompositeTools && allTools.browse_catalog) {
      selectedToolNames.add('browse_catalog');
      selectedToolNames.add('get_product_quote');
    } else {
      if (allTools.get_product) selectedToolNames.add('get_product');
      if (allTools.find_variant) selectedToolNames.add('find_variant');
    }
  }

  // 2. Check active pending checkout state
  if (agentState?.pendingOrder) {
    if (enableCompositeTools && allTools.place_order) {
      selectedToolNames.add('place_order');
      selectedToolNames.add('get_product_quote');
    } else {
      if (allTools.create_order) selectedToolNames.add('create_order');
      if (allTools.find_variant) selectedToolNames.add('find_variant');
    }
  }

  // 2. Map classified intents to tool categories
  for (const intent of intents) {
    switch (intent) {
      case 'browse':
        if (enableCompositeTools && allTools.browse_catalog) {
          selectedToolNames.add('browse_catalog');
          selectedToolNames.add('get_product_quote');
        } else {
          if (allTools.show_products) selectedToolNames.add('show_products');
          if (allTools.get_product) selectedToolNames.add('get_product');
        }
        break;

      case 'quote':
        if (enableCompositeTools && allTools.get_product_quote) {
          selectedToolNames.add('get_product_quote');
          selectedToolNames.add('browse_catalog');
        } else {
          if (allTools.get_product_options) selectedToolNames.add('get_product_options');
          if (allTools.find_variant) selectedToolNames.add('find_variant');
          if (allTools.get_product_by_variant_id) selectedToolNames.add('get_product_by_variant_id');
        }
        if (allTools.getProductInfoWithQuery) selectedToolNames.add('getProductInfoWithQuery');
        break;

      case 'checkout':
        if (enableCompositeTools && allTools.place_order) {
          selectedToolNames.add('place_order');
          selectedToolNames.add('get_product_quote');
        } else {
          if (allTools.create_order) selectedToolNames.add('create_order');
          if (allTools.get_product_options) selectedToolNames.add('get_product_options');
        }
        break;

      case 'tracking':
        if (enableCompositeTools && allTools.get_order_status) {
          selectedToolNames.add('get_order_status');
        } else {
          if (allTools.get_order) selectedToolNames.add('get_order');
          if (allTools.update_order) selectedToolNames.add('update_order');
          if (allTools.cancel_order) selectedToolNames.add('cancel_order');
        }
        break;

      case 'policy':
        if (enableCompositeTools && allTools.get_product_quote) {
          selectedToolNames.add('get_product_quote');
          selectedToolNames.add('browse_catalog');
        } else {
          if (allTools.get_product) selectedToolNames.add('get_product');
        }
        if (allTools.getProductInfoWithQuery) selectedToolNames.add('getProductInfoWithQuery');
        break;

      case 'escalate':
        if (allTools.report_human_intervene) selectedToolNames.add('report_human_intervene');
        break;

      case 'chitchat':
        // No heavy catalog tools required for bare greetings or acknowledgements
        break;

      case 'general':
      default:
        // Default core shopping fallback
        if (enableCompositeTools && allTools.browse_catalog) {
          selectedToolNames.add('browse_catalog');
          selectedToolNames.add('get_product_quote');
        } else {
          if (allTools.show_products) selectedToolNames.add('show_products');
          if (allTools.get_product) selectedToolNames.add('get_product');
        }
        if (allTools.getProductInfoWithQuery) selectedToolNames.add('getProductInfoWithQuery');
        break;
    }
  }

  // 3. Always include conversational interaction helpers if room allows
  if (allTools.send_suggestions && selectedToolNames.size < maxTools) {
    selectedToolNames.add('send_suggestions');
  }

  // 4. Resolve tool instances from names and enforce budget cap
  const selectedTools: StructuredTool[] = [];
  for (const name of selectedToolNames) {
    const t = allTools[name];
    if (t) {
      selectedTools.push(t);
      if (selectedTools.length >= maxTools) break;
    }
  }

  // If nothing was selected (e.g. pure chitchat), provide at least send_suggestions if available
  if (selectedTools.length === 0 && allTools.send_suggestions) {
    selectedTools.push(allTools.send_suggestions);
  }

  return selectedTools;
}
