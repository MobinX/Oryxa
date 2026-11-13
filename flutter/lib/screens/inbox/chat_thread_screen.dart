import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_theme.dart';
import '../../models/business.dart';
import '../../models/channel.dart';
import '../../models/conversation.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../services/diagnostics_service.dart';
import '../orders/order_detail_screen.dart';

/// Mirrors `apps/web/lib/payment-strategy.ts`: a product override wins, and an
/// unknown value falls back to cash on delivery.
String _resolveStrategy(String? storeDefault, String? productOverride) {
  if (productOverride == 'cod' ||
      productOverride == 'delivery_prepaid' ||
      productOverride == 'full_prepaid') {
    return productOverride!;
  }
  if (storeDefault == 'delivery_prepaid' || storeDefault == 'full_prepaid') {
    return storeDefault!;
  }
  return 'cod';
}

bool _isStrategyOverride(String? storeDefault, String? productOverride) {
  final override = productOverride;
  if (override != 'cod' &&
      override != 'delivery_prepaid' &&
      override != 'full_prepaid') {
    return false;
  }
  return override != (storeDefault ?? 'cod');
}

bool _requiresUpfront(String strategy, double? shippingCost) {
  if (strategy == 'full_prepaid') return true;
  if (strategy == 'delivery_prepaid') {
    return shippingCost != null && shippingCost > 0;
  }
  return false;
}

String _strategyLabel(String strategy) {
  switch (strategy) {
    case 'delivery_prepaid':
      return 'Delivery charge prepaid';
    case 'full_prepaid':
      return 'Full payment prepaid';
    default:
      return 'Cash on delivery';
  }
}

String _strategyDescription(String strategy) {
  switch (strategy) {
    case 'delivery_prepaid':
      return 'Customer pays only the delivery charge before the order is placed, by any method except cash on delivery. The product price is paid on delivery.';
    case 'full_prepaid':
      return 'Customer pays the full amount (product + invoice delivery) before the order is placed, by any method except cash on delivery. Nothing remains on delivery.';
    default:
      return 'Customer pays everything (product + delivery) when the parcel arrives. Nothing is needed to place the order.';
  }
}

String _money(double value) => '৳${value.toStringAsFixed(0)}';

class ChatThreadScreen extends StatefulWidget {
  final ConversationModel conversation;
  final String businessId;

  const ChatThreadScreen({
    super.key,
    required this.conversation,
    required this.businessId,
  });

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen>
    with WidgetsBindingObserver {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  late ConversationModel _conversation;
  Timer? _pollTimer;
  Timer? _noticeTimer;
  bool _appActive = true;
  bool _polling = false;
  bool _refreshing = false;
  bool _savingAutopilot = false;
  bool _toggleSaved = false;
  bool _suggestionsDismissed = false;
  String? _notice;
  String? _lastSuggestKey;
  String? _sendingSuggestionId;
  final Set<String> _hiddenSuggestionIds = {};
  int _lastMessageCount = 0;
  bool _lastSuggesting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _conversation = widget.conversation;

    final inbox = context.read<InboxProvider>();
    inbox.addListener(_onInboxChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await inbox.fetchMessages(widget.businessId, widget.conversation.id);
      if (!mounted) return;
      _scrollToBottom(jump: true);
    });
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _noticeTimer?.cancel();
    try {
      context.read<InboxProvider>().removeListener(_onInboxChanged);
    } catch (_) {
      // The tree may already be gone; nothing to detach from.
    }
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appActive = state == AppLifecycleState.resumed;
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted || !_appActive || _polling) return;
      _polling = true;
      try {
        await context
            .read<InboxProvider>()
            .fetchMessages(widget.businessId, widget.conversation.id, silent: true);
      } finally {
        _polling = false;
      }
    });
  }

  void _onInboxChanged() {
    if (!mounted) return;
    final inbox = context.read<InboxProvider>();
    final count = inbox.activeMessages.length;
    final suggesting = inbox.isGeneratingSuggestions;
    if (count != _lastMessageCount) {
      _suggestionsDismissed = false;
    }
    if (count != _lastMessageCount || suggesting != _lastSuggesting) {
      _lastMessageCount = count;
      _lastSuggesting = suggesting;
      _scrollToBottom();
    }
  }

  void _scrollToBottom({bool jump = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      final target = _scrollController.position.maxScrollExtent;
      if (jump) {
        _scrollController.jumpTo(target);
      } else {
        _scrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  ConversationModel get _currentConversation {
    final inbox = context.read<InboxProvider>();
    final active = inbox.activeConversation;
    if (active != null && active.id == _conversation.id) return active;
    return _conversation;
  }

  bool get _businessAgentOn =>
      context.read<BusinessProvider>().currentBusiness?.agentState != false;

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppTheme.danger : AppTheme.success,
      ),
    );
  }

  void _flashNotice(String message) {
    _noticeTimer?.cancel();
    setState(() => _notice = message);
    _noticeTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => _notice = null);
    });
  }

  void _maybeGenerateSuggestions() {
    if (!mounted) return;
    final inbox = context.read<InboxProvider>();
    final biz = context.read<BusinessProvider>();
    final conversation = _currentConversation;
    final effectiveAutoPilot =
        conversation.autoPilot && (biz.currentBusiness?.agentState != false);
    final messages = inbox.activeMessages;

    if (effectiveAutoPilot ||
        messages.isEmpty ||
        !messages.last.isFromCustomer ||
        inbox.isGeneratingSuggestions) {
      return;
    }

    final key = messages.last.id;
    if (_lastSuggestKey == key) return;
    _lastSuggestKey = key;
    inbox.generateSuggestions(widget.businessId, widget.conversation.id);
  }

  Future<void> _send() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    appDiagnostics.recordMessage(
      'Inbox reply',
      'Send tapped (${_currentConversation.displayName})',
    );

    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendMessage(
      widget.businessId,
      widget.conversation.id,
      text,
    );
    if (!mounted) return;

    if (ok) {
      _messageController.clear();
      _lastSuggestKey = null;
      inbox.clearSuggestions();
      _scrollToBottom();
    } else {
      final message = inbox.errorMessage ?? 'Failed to send message.';
      appDiagnostics.recordMessage('Inbox reply', 'Send failed: $message');
      _showSnack(message, isError: true);
    }
  }

  Future<void> _refreshThread({bool manual = false}) async {
    if (_refreshing) return;
    if (manual) setState(() => _refreshing = true);
    try {
      await context
          .read<InboxProvider>()
          .fetchMessages(widget.businessId, widget.conversation.id, silent: true);
    } finally {
      if (mounted && manual) setState(() => _refreshing = false);
    }
  }

  Future<void> _toggleAutopilot() async {
    if (_savingAutopilot) return;
    if (!_businessAgentOn) {
      _showSnack(
        'The AI agent is turned off for this business. Turn it on in Dashboard.',
        isError: true,
      );
      return;
    }

    final inbox = context.read<InboxProvider>();
    final conversation = _currentConversation;
    final target = !conversation.autoPilot;
    setState(() {
      _savingAutopilot = true;
      _toggleSaved = false;
    });

    final ok = await inbox.setAutopilot(
      widget.businessId,
      widget.conversation.id,
      target,
    );
    if (!mounted) return;
    setState(() {
      _savingAutopilot = false;
      if (ok) {
        _conversation = _conversation.copyWith(autoPilot: target);
        _toggleSaved = true;
        _lastSuggestKey = null;
      }
    });
    if (!ok) {
      appDiagnostics.recordMessage(
        'Inbox auto pilot',
        inbox.errorMessage ?? 'Could not change auto pilot',
      );
      _showSnack(
        inbox.errorMessage ?? 'Could not change auto pilot. Please try again.',
        isError: true,
      );
      return;
    }
    if (target) {
      inbox.clearSuggestions();
    } else {
      _maybeGenerateSuggestions();
    }
    Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _toggleSaved = false);
    });
  }

  Future<void> _toggleResolved() async {
    final conversation = _currentConversation;
    final target = conversation.isResolved ? 'pending' : 'done';
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.updateConversationState(
      widget.businessId,
      widget.conversation.id,
      target,
    );
    if (!mounted) return;
    if (!ok) {
      _showSnack(inbox.errorMessage ?? 'Could not change the conversation state', isError: true);
      return;
    }
    setState(() {
      _conversation = _conversation.copyWith(lastMessageState: target);
    });
    _showSnack(target == 'done' ? 'Conversation marked resolved' : 'Conversation reopened');
  }

  Future<void> _deleteConversation() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete conversation?'),
        content: Text(
          'Delete the conversation with ${_currentConversation.displayName} and all its messages? '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final inbox = context.read<InboxProvider>();
    final ok = await inbox.deleteConversation(widget.businessId, widget.conversation.id);
    if (!mounted) return;
    if (!ok) {
      _showSnack(inbox.errorMessage ?? 'Conversation was not deleted', isError: true);
      return;
    }
    Navigator.pop(context);
  }

  Future<void> _openTools() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Send a card or make an order',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            _ToolMenuItem(
              icon: Icons.format_list_bulleted,
              label: 'Send product list',
              hint: 'Top 15 products by category',
              onTap: () => Navigator.pop(ctx, 'product_list'),
            ),
            _ToolMenuItem(
              icon: Icons.info_outline,
              label: 'Send product info',
              hint: 'Every variant with its first photo',
              onTap: () => Navigator.pop(ctx, 'product_info'),
            ),
            _ToolMenuItem(
              icon: Icons.photo_library_outlined,
              label: 'Send product variant',
              hint: 'All photos of one variant',
              onTap: () => Navigator.pop(ctx, 'product_variant'),
            ),
            _ToolMenuItem(
              icon: Icons.shopping_cart_outlined,
              label: 'Make order',
              hint: 'Create it for this customer',
              onTap: () => Navigator.pop(ctx, 'order'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    await _runTool(choice);
  }

  Future<void> _runTool(String choice) async {
    _ToolResult? result;

    if (choice == 'product_list') {
      result = await showModalBottomSheet<_ToolResult>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _ProductListSheet(
          businessId: widget.businessId,
          conversationId: widget.conversation.id,
        ),
      );
    } else if (choice == 'product_info') {
      final product = await _pickProduct(context, widget.businessId);
      if (product == null || !mounted) return;
      final inbox = context.read<InboxProvider>();
      final ok = await inbox.sendSuggestion(
        widget.businessId,
        widget.conversation.id,
        {'kind': 'product_info', 'productId': product.id},
      );
      result = ok
          ? const _ToolResult.success('Product cards sent')
          : _ToolResult.error(
              inbox.suggestionError ?? 'Could not send the product cards');
    } else if (choice == 'product_variant') {
      final product = await _pickProduct(context, widget.businessId);
      if (product == null || !mounted) return;
      result = await showModalBottomSheet<_ToolResult>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _VariantPickerSheet(
          businessId: widget.businessId,
          conversationId: widget.conversation.id,
          product: product,
        ),
      );
    } else if (choice == 'order') {
      result = await showModalBottomSheet<_ToolResult>(
        context: context,
        isScrollControlled: true,
        isDismissible: true,
        showDragHandle: true,
        builder: (_) => _OrderComposerSheet(
          businessId: widget.businessId,
          conversationId: widget.conversation.id,
          customerName: _currentConversation.customerName ?? '',
          paymentMethods:
              context.read<BusinessProvider>().currentBusiness?.paymentMethods ??
                  const [],
          paymentStrategy:
              context.read<BusinessProvider>().currentBusiness?.paymentStrategy,
        ),
      );
    }

    if (!mounted || result == null) return;
    if (!result.success) {
      _showSnack(result.message, isError: true);
      return;
    }
    _flashNotice(result.message);
    await _refreshThread();
    if (!mounted) return;
    if (result.openOrderId != null) {
      await _openOrder(result.openOrderId!);
    }
  }

  Future<void> _openOrder(String orderId) async {
    final orders = context.read<OrdersProvider>();
    final order = await orders.fetchOrderDetail(widget.businessId, orderId);
    if (!mounted) return;
    if (order == null) {
      _showSnack('The order could not be loaded.', isError: true);
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OrderDetailScreen(
          order: order,
          businessId: widget.businessId,
        ),
      ),
    );
  }

  Future<void> _sendSuggestion(InboxSuggestion suggestion) async {
    if (suggestion.kind == 'order') {
      final result = await showModalBottomSheet<_ToolResult>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _OrderComposerSheet(
          businessId: widget.businessId,
          conversationId: widget.conversation.id,
          customerName: _currentConversation.customerName ?? '',
          paymentMethods:
              context.read<BusinessProvider>().currentBusiness?.paymentMethods ??
                  const [],
          paymentStrategy:
              context.read<BusinessProvider>().currentBusiness?.paymentStrategy,
          initialProductId: suggestion.productId,
          initialCount: suggestion.count,
          initialPhone: suggestion.customerPhone,
          initialAddress: suggestion.customerAddress,
          initialShipping: suggestion.shippingCost,
          initialTransactionId: suggestion.transactionId,
        ),
      );
      if (!mounted || result == null) return;
      if (!result.success) {
        _showSnack(result.message, isError: true);
        return;
      }
      _flashNotice(result.message);
      await _refreshThread();
      if (result.openOrderId != null && mounted) {
        await _openOrder(result.openOrderId!);
      }
      return;
    }

    final payload = suggestion.toSendPayload();
    if (payload == null || _sendingSuggestionId != null) return;

    setState(() => _sendingSuggestionId = suggestion.id);
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendSuggestion(
      widget.businessId,
      widget.conversation.id,
      payload,
    );
    if (!mounted) return;
    setState(() {
      _sendingSuggestionId = null;
      if (ok) _hiddenSuggestionIds.add(suggestion.id);
    });
    if (!ok) {
      _showSnack(inbox.suggestionError ?? 'Could not send this suggestion', isError: true);
      return;
    }
    _flashNotice('Sent to the customer');
    _lastSuggestKey = null;
    await _refreshThread();
  }

  void _useTextSuggestion(String text) {
    _messageController.text = text;
    _messageController.selection =
        TextSelection.collapsed(offset: _messageController.text.length);
    FocusScope.of(context).requestFocus(FocusNode());
  }

  Future<void> _showCustomerDetails() async {
    final biz = context.read<BusinessProvider>();
    final conversation = _currentConversation;
    ChannelModel? channel;
    for (final item in biz.channels) {
      if (item.id == conversation.channelId) {
        channel = item;
        break;
      }
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CustomerDetailsSheet(
        conversation: conversation,
        channel: channel,
        messages: context.read<InboxProvider>().activeMessages,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final inbox = context.watch<InboxProvider>();
    final biz = context.watch<BusinessProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final conversation = _currentConversation;
    final messages = inbox.activeMessages;
    final businessAgentOn = biz.currentBusiness?.agentState != false;
    final effectiveAutoPilot = conversation.autoPilot && businessAgentOn;
    final suggestionsVisible = !effectiveAutoPilot;

    ChannelModel? channel;
    for (final item in biz.channels) {
      if (item.id == conversation.channelId) {
        channel = item;
        break;
      }
    }
    final platformLabel = channel?.platform == 'instagram'
        ? 'Instagram'
        : channel?.platform == 'facebook'
            ? 'Facebook Page'
            : 'Channel';

    final suggestions = inbox.suggestions
        .where((s) => !_hiddenSuggestionIds.contains(s.id))
        .toList();

    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeGenerateSuggestions());

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
              child: Text(
                conversation.initials,
                style: const TextStyle(
                  color: AppTheme.primaryColor,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conversation.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    '${conversation.pageName ?? platformLabel} · '
                    '${conversation.isResolved ? 'Resolved' : conversation.isWorking ? 'AI Replying' : 'Active'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark
                          ? AppTheme.textDarkSecondary
                          : AppTheme.textLightSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Customer details',
            icon: const Icon(Icons.info_outline, size: 20),
            onPressed: _showCustomerDetails,
          ),
          IconButton(
            tooltip: conversation.isResolved ? 'Reopen conversation' : 'Mark resolved',
            icon: Icon(
              conversation.isResolved
                  ? Icons.mark_chat_unread_outlined
                  : Icons.check_circle_outline,
              size: 21,
            ),
            onPressed: _toggleResolved,
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'delete') _deleteConversation();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'delete',
                child: Row(
                  children: [
                    Icon(Icons.delete_outline, size: 18, color: AppTheme.danger),
                    SizedBox(width: 8),
                    Text('Delete conversation', style: TextStyle(color: AppTheme.danger)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          _buildControlBar(context, conversation, businessAgentOn, inbox, isDark),
          Expanded(
            child: inbox.isLoadingMessages && messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
                    children: [
                      Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: isDark ? AppTheme.cardDark : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isDark
                                  ? AppTheme.borderDark
                                  : AppTheme.borderLight,
                            ),
                          ),
                          child: Text(
                            'Conversation started ${_startedLabel(conversation)}',
                            style: TextStyle(
                              fontSize: 10,
                              color: isDark
                                  ? AppTheme.textDarkSecondary
                                  : Colors.grey.shade600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      ...messages.map(
                        (message) => _MessageBubble(
                          message: message,
                          initials: conversation.initials,
                          isDark: isDark,
                        ),
                      ),
                      if (inbox.isGeneratingSuggestions &&
                          suggestionsVisible) ...[
                        const SizedBox(height: 4),
                        _TypingBubble(isDark: isDark),
                      ],
                      if (messages.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 40),
                          child: Center(
                            child: Text(
                              'No messages in this conversation yet.',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          if (suggestionsVisible &&
              !_suggestionsDismissed &&
              (inbox.isGeneratingSuggestions ||
                  suggestions.isNotEmpty ||
                  inbox.suggestionError != null))
            _buildSuggestionsPanel(
              context,
              inbox,
              suggestions,
              isDark,
            ),
          _buildComposer(context, inbox, suggestionsVisible, isDark),
        ],
      ),
    );
  }

  Widget _buildControlBar(
    BuildContext context,
    ConversationModel conversation,
    bool businessAgentOn,
    InboxProvider inbox,
    bool isDark,
  ) {
    final effectiveAutoPilot = conversation.autoPilot && businessAgentOn;
    final hint = !businessAgentOn
        ? 'Agent is off for this business. AI still suggests replies.'
        : effectiveAutoPilot
            ? 'The AI answers this customer'
            : 'Messages wait for you; AI suggests replies';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : Colors.white,
        border: Border(
          bottom: BorderSide(
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              InkWell(
                onTap: (_savingAutopilot || !businessAgentOn) ? null : _toggleAutopilot,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: effectiveAutoPilot
                        ? AppTheme.success.withValues(alpha: 0.12)
                        : (isDark ? AppTheme.cardDark : Colors.grey.shade100),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: effectiveAutoPilot
                          ? AppTheme.success.withValues(alpha: 0.35)
                          : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.bolt,
                        size: 14,
                        color: effectiveAutoPilot
                            ? AppTheme.success
                            : (isDark
                                ? AppTheme.textDarkSecondary
                                : AppTheme.textLightSecondary),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Auto pilot',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: effectiveAutoPilot
                              ? AppTheme.success
                              : (isDark
                                  ? AppTheme.textDarkSecondary
                                  : AppTheme.textLightSecondary),
                        ),
                      ),
                      const SizedBox(width: 5),
                      Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: effectiveAutoPilot
                              ? AppTheme.success
                              : (isDark ? Colors.grey.shade700 : Colors.grey.shade400),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          effectiveAutoPilot ? 'ON' : 'OFF',
                          style: const TextStyle(
                            fontSize: 7,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (_savingAutopilot) ...[
                        const SizedBox(width: 5),
                        const SizedBox(
                          width: 11,
                          height: 11,
                          child: CircularProgressIndicator(strokeWidth: 1.6),
                        ),
                      ] else if (_toggleSaved) ...[
                        const SizedBox(width: 5),
                        const Icon(Icons.check, size: 13, color: AppTheme.success),
                      ],
                    ],
                  ),
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: _refreshing ? null : () => _refreshThread(manual: true),
                icon: _refreshing
                    ? const SizedBox(
                        width: 13,
                        height: 13,
                        child: CircularProgressIndicator(strokeWidth: 1.6),
                      )
                    : const Icon(Icons.refresh, size: 15),
                label: const Text('Refresh'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 30),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  textStyle:
                      const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: Text(
                  hint,
                  style: TextStyle(
                    fontSize: 9,
                    color: isDark
                        ? AppTheme.textDarkSecondary
                        : Colors.grey.shade500,
                  ),
                ),
              ),
              if (inbox.isGeneratingSuggestions && !effectiveAutoPilot)
                const Text(
                  'AI is suggesting…',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primaryColor,
                  ),
                ),
              if (_notice != null)
                Text(
                  _notice!,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.success,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestionsPanel(
    BuildContext context,
    InboxProvider inbox,
    List<InboxSuggestion> suggestions,
    bool isDark,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: isDark ? 0.1 : 0.04),
        border: Border(
          top: BorderSide(
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 14, color: AppTheme.primaryColor),
              const SizedBox(width: 5),
              Text(
                inbox.isGeneratingSuggestions ? 'AI is suggesting…' : 'AI suggestions',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
              const Spacer(),
              if (inbox.suggestionError != null) ...[
                TextButton(
                  onPressed: () {
                    _lastSuggestKey = null;
                    inbox.generateSuggestions(
                      widget.businessId,
                      widget.conversation.id,
                    );
                  },
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 26),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'Retry',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.danger,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
              ],
              InkWell(
                onTap: () => setState(() => _suggestionsDismissed = true),
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    Icons.close,
                    size: 16,
                    color: isDark
                        ? AppTheme.textDarkSecondary
                        : Colors.grey.shade600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (inbox.suggestionError != null)
            Text(
              inbox.suggestionError!,
              style: const TextStyle(fontSize: 11, color: AppTheme.danger),
            )
          else if (inbox.isGeneratingSuggestions)
            Row(
              children: [
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.8),
                ),
                const SizedBox(width: 8),
                Text(
                  'Reading the conversation and the catalog — you can keep typing.',
                  style: TextStyle(
                    fontSize: 10,
                    color: isDark
                        ? AppTheme.textDarkSecondary
                        : Colors.grey.shade600,
                  ),
                ),
              ],
            )
          else
            SizedBox(
              height: 154,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: suggestions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, index) {
                  final suggestion = suggestions[index];
                  return _SuggestionCard(
                    suggestion: suggestion,
                    busy: _sendingSuggestionId == suggestion.id,
                    sent: _hiddenSuggestionIds.contains(suggestion.id),
                    isDark: isDark,
                    onUseText: () => _useTextSuggestion(suggestion.text ?? ''),
                    onSend: () => _sendSuggestion(suggestion),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildComposer(
    BuildContext context,
    InboxProvider inbox,
    bool suggestionsVisible,
    bool isDark,
  ) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : Colors.white,
        border: Border(
          top: BorderSide(
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            if (suggestionsVisible &&
                _suggestionsDismissed &&
                (inbox.suggestions.isNotEmpty || inbox.isGeneratingSuggestions)) ...[
              GestureDetector(
                onTap: () => setState(() => _suggestionsDismissed = false),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: isDark ? 0.15 : 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.primaryColor.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.auto_awesome, size: 13, color: AppTheme.primaryColor),
                      const SizedBox(width: 6),
                      Text(
                        'Show AI suggestions (${inbox.suggestions.length})',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (suggestionsVisible && inbox.isGeneratingSuggestions && !_suggestionsDismissed) ...[
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppTheme.primaryColor.withValues(alpha: 0.3),
                  ),
                ),
                child: const Row(
                  children: [
                    SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 1.8),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'AI is suggesting a reply… you can keep typing.',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            Row(
              children: [
                IconButton(
                  tooltip: 'Send a card or make an order',
                  onPressed: _openTools,
                  icon: const Icon(Icons.add_circle_outline),
                  color: AppTheme.primaryColor,
                ),
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                      filled: true,
                      fillColor: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(
                  onPressed: inbox.isSending ? null : _send,
                  icon: inbox.isSending
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send, size: 18),
                  style: IconButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Replies are sent directly to the customer.',
                style: TextStyle(
                  fontSize: 9,
                  color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _startedLabel(ConversationModel conversation) {
    final at = conversation.createdAt;
    if (at == null) return '—';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    final suffix = at.hour < 12 ? 'AM' : 'PM';
    return '${months[at.month - 1]} ${at.day}, ${at.year}, $hour12:$minute $suffix';
  }
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

class _MessageBubble extends StatelessWidget {
  final MessageModel message;
  final String initials;
  final bool isDark;

  const _MessageBubble({
    required this.message,
    required this.initials,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final fromCustomer = message.isFromCustomer;
    final maxWidth = MediaQuery.of(context).size.width * 0.76;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            fromCustomer ? MainAxisAlignment.start : MainAxisAlignment.end,
        children: [
          if (fromCustomer) ...[
            Container(
              width: 26,
              height: 26,
              margin: const EdgeInsets.only(bottom: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Text(
                initials,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
            const SizedBox(width: 7),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  fromCustomer ? CrossAxisAlignment.start : CrossAxisAlignment.end,
              children: [
                Container(
                  constraints: BoxConstraints(maxWidth: maxWidth),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: fromCustomer
                        ? (isDark ? AppTheme.cardDark : Colors.white)
                        : AppTheme.primaryColor,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(fromCustomer ? 3 : 16),
                      bottomRight: Radius.circular(fromCustomer ? 16 : 3),
                    ),
                    border: fromCustomer
                        ? Border.all(
                            color: isDark
                                ? AppTheme.borderDark
                                : AppTheme.borderLight,
                          )
                        : null,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (message.images.isNotEmpty)
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: message.images.map((url) {
                            return GestureDetector(
                              onTap: () => launchUrl(
                                Uri.parse(url),
                                mode: LaunchMode.externalApplication,
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: CachedNetworkImage(
                                  imageUrl: url,
                                  width: 150,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => Container(
                                    width: 120,
                                    height: 80,
                                    color: Colors.grey.shade200,
                                    alignment: Alignment.center,
                                    child: const Icon(
                                      Icons.broken_image_outlined,
                                      size: 20,
                                      color: Colors.grey,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      if (message.images.isNotEmpty && message.content.isNotEmpty)
                        const SizedBox(height: 5),
                      if (message.content.isNotEmpty)
                        Text(
                          message.content,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.35,
                            color: fromCustomer
                                ? (isDark ? Colors.white : Colors.black87)
                                : Colors.white,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 2),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    message.timeLabel,
                    style: TextStyle(
                      fontSize: 9,
                      color: isDark
                          ? AppTheme.textDarkSecondary
                          : Colors.grey.shade500,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (!fromCustomer) ...[
            const SizedBox(width: 7),
            Container(
              width: 26,
              height: 26,
              margin: const EdgeInsets.only(bottom: 16),
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppTheme.primaryColor,
                shape: BoxShape.circle,
              ),
              child: Text(
                message.sentBy == 'human' ? 'You' : 'AI',
                style: const TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  final bool isDark;

  const _TypingBubble({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Flexible(
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.76,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.85),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(3),
              ),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 11,
                  height: 11,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.6,
                    color: Colors.white,
                  ),
                ),
                SizedBox(width: 7),
                Flexible(
                  child: Text(
                    'AI is suggesting a reply… you can keep typing.',
                    style: TextStyle(fontSize: 10, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 7),
        Container(
          width: 26,
          height: 26,
          margin: const EdgeInsets.only(bottom: 16),
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppTheme.primaryColor,
            shape: BoxShape.circle,
          ),
          child: const Text(
            'AI',
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  final InboxSuggestion suggestion;
  final bool busy;
  final bool sent;
  final bool isDark;
  final VoidCallback onUseText;
  final VoidCallback onSend;

  const _SuggestionCard({
    required this.suggestion,
    required this.busy,
    required this.sent,
    required this.isDark,
    required this.onUseText,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    final isText = suggestion.isText;
    return Container(
      width: isText ? 230 : 214,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.cardDark : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isText)
            Expanded(
              child: Text(
                suggestion.text ?? '',
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, height: 1.35),
              ),
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _suggestionImage(isDark),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        suggestion.displayTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        suggestion.displaySubtitle,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 9,
                          height: 1.3,
                          color: isDark
                              ? AppTheme.textDarkSecondary
                              : Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          const Spacer(),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: (busy || sent) ? null : (isText ? onUseText : onSend),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 6),
                textStyle: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: busy
                  ? const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.6,
                        color: Colors.white,
                      ),
                    )
                  : sent
                      ? const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.check, size: 12),
                            SizedBox(width: 3),
                            Text('Done'),
                          ],
                        )
                      : Text(
                          isText ? 'Use this reply' : suggestion.actionLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _suggestionImage(bool isDark) {
    if (suggestion.kind == 'category') {
      final products = suggestion.products.where((p) => p.imageUrl != null).take(4).toList();
      if (products.isEmpty) {
        return Icon(Icons.category_outlined, size: 34, color: Colors.grey.shade400);
      }
      return SizedBox(
        width: 42,
        height: 42,
        child: Wrap(
          spacing: 2,
          runSpacing: 2,
          children: products.map((p) {
            return ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: CachedNetworkImage(
                imageUrl: p.imageUrl!,
                width: 20,
                height: 20,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => Container(
                  width: 20,
                  height: 20,
                  color: Colors.grey.shade200,
                ),
              ),
            );
          }).toList(),
        ),
      );
    }
    final url = suggestion.displayImage;
    if (url == null) {
      return Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isDark ? AppTheme.surfaceDark : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(Icons.inventory_2_outlined,
            size: 18, color: Colors.grey.shade400),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: CachedNetworkImage(
        imageUrl: url,
        width: 42,
        height: 42,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => Container(
          width: 42,
          height: 42,
          color: Colors.grey.shade200,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Composer tool sheets
// ---------------------------------------------------------------------------

class _ToolResult {
  final bool success;
  final String message;
  final String? openOrderId;

  const _ToolResult.success(this.message, {this.openOrderId}) : success = true;
  const _ToolResult.error(this.message)
      : success = false,
        openOrderId = null;
}

class _ToolMenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String hint;
  final VoidCallback onTap;

  const _ToolMenuItem({
    required this.icon,
    required this.label,
    required this.hint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: AppTheme.primaryColor.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 19, color: AppTheme.primaryColor),
      ),
      title: Text(
        label,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
      ),
      subtitle: Text(hint, style: const TextStyle(fontSize: 10)),
      onTap: onTap,
    );
  }
}

Future<ProductModel?> _pickProduct(BuildContext context, String businessId) {
  return showModalBottomSheet<ProductModel>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ProductPickerSheet(businessId: businessId),
  );
}

class _ProductPickerSheet extends StatefulWidget {
  final String businessId;

  const _ProductPickerSheet({required this.businessId});

  @override
  State<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends State<_ProductPickerSheet> {
  final _searchController = TextEditingController();
  List<ProductModel> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load(''));
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load(String term) async {
    setState(() => _loading = true);
    final items = await context
        .read<ProductsProvider>()
        .searchProducts(widget.businessId, term);
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.72,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Pick a product',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    onSubmitted: _load,
                    decoration: const InputDecoration(
                      hintText: 'Search products by name or SKU...',
                      isDense: true,
                      prefixIcon: Icon(Icons.search, size: 18),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _load(_searchController.text),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                  child: const Text('Search'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _items.isEmpty
                      ? const Center(
                          child: Text(
                            'No products found.',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _items.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 6),
                          itemBuilder: (_, index) {
                            final item = _items[index];
                            final strategy = item.paymentStrategyOverride;
                            return InkWell(
                              onTap: () => Navigator.pop(context, item),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isDark
                                        ? AppTheme.borderDark
                                        : AppTheme.borderLight,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: item.imageUrl != null
                                          ? CachedNetworkImage(
                                              imageUrl: item.imageUrl!,
                                              width: 40,
                                              height: 40,
                                              fit: BoxFit.cover,
                                              errorWidget: (_, __, ___) =>
                                                  _productPlaceholder(),
                                            )
                                          : _productPlaceholder(),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            item.name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${_money(item.price)} · ${item.variantCount} variant'
                                            '${item.variantCount == 1 ? '' : 's'}'
                                            '${strategy == null ? '' : ' · ${_strategyLabel(strategy)} payment'}',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: isDark
                                                  ? AppTheme.textDarkSecondary
                                                  : Colors.grey.shade600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const Icon(
                                      Icons.chevron_right,
                                      size: 18,
                                      color: Colors.grey,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _productPlaceholder() {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      color: Colors.grey.shade100,
      child: Icon(Icons.inventory_2_outlined, size: 18, color: Colors.grey.shade400),
    );
  }
}

class _ProductListSheet extends StatefulWidget {
  final String businessId;
  final String conversationId;

  const _ProductListSheet({
    required this.businessId,
    required this.conversationId,
  });

  @override
  State<_ProductListSheet> createState() => _ProductListSheetState();
}

class _ProductListSheetState extends State<_ProductListSheet> {
  List<CategoryModel> _categories = [];
  String? _categoryId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final provider = context.read<ProductsProvider>();
      if (provider.categories.isEmpty) {
        await provider.fetchCategories(widget.businessId);
      }
      if (!mounted) return;
      setState(() {
        _categories = provider.categories;
        // The web preselects the first category so the merchant can send the list in one tap;
        // "All products" stays available as the explicit empty choice.
        _categoryId = _categoryId ?? (_categories.isEmpty ? null : _categories.first.id);
      });
    });
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendSuggestion(
      widget.businessId,
      widget.conversationId,
      {
        'kind': 'product_list',
        if (_categoryId != null) 'categoryId': _categoryId,
      },
    );
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, const _ToolResult.success('Sent to the customer'));
    } else {
      setState(() {
        _busy = false;
        _error = inbox.suggestionError ?? 'Could not send the product list';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Send product list',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            const Text(
              'Choose a category; the first 15 products are sent as cards.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String?>(
              value: _categoryId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All products'),
                ),
                ..._categories.map((category) => DropdownMenuItem<String?>(
                      value: category.id,
                      child: Text(
                        '${category.name} (${category.productCount})',
                      ),
                    )),
              ],
              onChanged: (value) => setState(() => _categoryId = value),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(fontSize: 11, color: AppTheme.danger),
              ),
            ],
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _busy ? null : _send,
                icon: _busy
                    ? const SizedBox(
                        width: 13,
                        height: 13,
                        child: CircularProgressIndicator(
                            strokeWidth: 1.8, color: Colors.white),
                      )
                    : const Icon(Icons.send, size: 16),
                label: const Text('Send list'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VariantPickerSheet extends StatefulWidget {
  final String businessId;
  final String conversationId;
  final ProductModel product;

  const _VariantPickerSheet({
    required this.businessId,
    required this.conversationId,
    required this.product,
  });

  @override
  State<_VariantPickerSheet> createState() => _VariantPickerSheetState();
}

class _VariantPickerSheetState extends State<_VariantPickerSheet> {
  bool _busy = false;
  String? _busyVariantId;
  String? _error;

  Future<void> _send(ProductVariantModel variant) async {
    setState(() {
      _busy = true;
      _busyVariantId = variant.id;
      _error = null;
    });
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendSuggestion(
      widget.businessId,
      widget.conversationId,
      {
        'kind': 'product_variant',
        'productId': widget.product.id,
        'variantId': variant.id,
      },
    );
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, const _ToolResult.success('Product cards sent'));
    } else {
      setState(() {
        _busy = false;
        _busyVariantId = null;
        _error = inbox.suggestionError ?? 'Could not send the variant';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.62,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Send product variant',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            Text(
              widget.product.name,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            const Text(
              'Pick a variant; all its photos are sent.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(fontSize: 11, color: AppTheme.danger),
              ),
            ],
            const SizedBox(height: 10),
            Expanded(
              child: ListView.separated(
                itemCount: widget.product.variants.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (_, index) {
                  final variant = widget.product.variants[index];
                  final photos = variant.photoCount;
                  final disabled =
                      !variant.isAvailable || variant.stock <= 0 || photos == 0;
                  return InkWell(
                    onTap: (disabled || _busy) ? null : () => _send(variant),
                    borderRadius: BorderRadius.circular(10),
                    child: Opacity(
                      opacity: disabled ? 0.5 : 1,
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isDark
                                ? AppTheme.borderDark
                                : AppTheme.borderLight,
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                variant.name,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (_busyVariantId == variant.id)
                              const Padding(
                                padding: EdgeInsets.only(right: 8),
                                child: SizedBox(
                                  width: 13,
                                  height: 13,
                                  child: CircularProgressIndicator(strokeWidth: 1.8),
                                ),
                              ),
                            Text(
                              '${_money(variant.price)} · ${variant.stock} left · '
                              '$photos photo${photos == 1 ? '' : 's'}',
                              style: TextStyle(
                                fontSize: 10,
                                color: isDark
                                    ? AppTheme.textDarkSecondary
                                    : Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderComposerSheet extends StatefulWidget {
  final String businessId;
  final String conversationId;
  final String customerName;
  final List<PaymentMethodModel> paymentMethods;
  final String? paymentStrategy;
  final String? initialProductId;
  final int? initialCount;
  final String? initialPhone;
  final String? initialAddress;
  final double? initialShipping;
  final String? initialTransactionId;

  const _OrderComposerSheet({
    required this.businessId,
    required this.conversationId,
    required this.customerName,
    required this.paymentMethods,
    required this.paymentStrategy,
    this.initialProductId,
    this.initialCount,
    this.initialPhone,
    this.initialAddress,
    this.initialShipping,
    this.initialTransactionId,
  });

  @override
  State<_OrderComposerSheet> createState() => _OrderComposerSheetState();
}

class _OrderComposerSheetState extends State<_OrderComposerSheet> {
  final _formKey = GlobalKey<FormState>();
  final _searchController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _countController = TextEditingController(text: '1');
  final _shippingController = TextEditingController();
  final _txnController = TextEditingController();

  ProductModel? _product;
  String? _variantId;
  String _payment = 'Cash on delivery';
  bool _loadingProduct = false;
  bool _loadingSearch = true;
  bool _busy = false;
  String? _error;
  List<ProductModel> _results = [];
  Map<String, dynamic>? _result;
  bool _orderCardSent = false;
  bool _orderCardBusy = false;

  @override
  void initState() {
    super.initState();
    _nameController.text = widget.customerName;
    _countController.text =
        '${widget.initialCount != null && widget.initialCount! > 0 ? widget.initialCount : 1}';
    if (widget.initialPhone != null) _phoneController.text = widget.initialPhone!;
    if (widget.initialAddress != null) {
      _addressController.text = widget.initialAddress!;
    }
    if (widget.initialShipping != null && widget.initialShipping! > 0) {
      _shippingController.text =
          widget.initialShipping! == widget.initialShipping!.roundToDouble()
              ? widget.initialShipping!.toInt().toString()
              : widget.initialShipping!.toString();
    }
    if (widget.initialTransactionId != null &&
        widget.initialTransactionId!.isNotEmpty) {
      _txnController.text = widget.initialTransactionId!;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final inbox = context.read<InboxProvider>();
      final defaults = await inbox.fetchOrderDefaults(
        widget.businessId,
        widget.conversationId,
      );
      if (!mounted) return;
      if (defaults != null) {
        setState(() {
          if (widget.initialCount == null || widget.initialCount! <= 0) {
            _countController.text = '${defaults.count > 0 ? defaults.count : 1}';
          }
          if (_phoneController.text.trim().isEmpty) {
            _phoneController.text = defaults.customerPhone;
          }
          if (_addressController.text.trim().isEmpty) {
            _addressController.text = defaults.customerAddress;
          }
          if (_shippingController.text.trim().isEmpty &&
              defaults.shippingCost != null &&
              defaults.shippingCost! > 0) {
            _shippingController.text =
                defaults.shippingCost! == defaults.shippingCost!.roundToDouble()
                    ? defaults.shippingCost!.toInt().toString()
                    : defaults.shippingCost!.toString();
          }
          if (_txnController.text.trim().isEmpty &&
              defaults.transactionId != null &&
              defaults.transactionId!.isNotEmpty) {
            _txnController.text = defaults.transactionId!;
          }
        });
      }

      if (widget.initialProductId != null) {
        await _loadProduct(widget.initialProductId!);
      } else {
        await _search('');
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _countController.dispose();
    _shippingController.dispose();
    _txnController.dispose();
    super.dispose();
  }

  Future<void> _search(String term) async {
    setState(() => _loadingSearch = true);
    final items = await context
        .read<ProductsProvider>()
        .searchProducts(widget.businessId, term);
    if (!mounted) return;
    setState(() {
      _results = items;
      _loadingSearch = false;
    });
  }

  Future<void> _loadProduct(String productId) async {
    setState(() => _loadingProduct = true);
    final provider = context.read<ProductsProvider>();
    ProductModel? detailed =
        await provider.fetchProductDetail(widget.businessId, productId);
    if (detailed == null) {
      for (final item in _results) {
        if (item.id == productId) {
          detailed = item;
          break;
        }
      }
    }
    if (!mounted) return;
    if (detailed == null) {
      setState(() {
        _loadingProduct = false;
        _error = 'That product could not be loaded. Try another one.';
      });
      return;
    }

    final firstAvailable = detailed.variants.isNotEmpty
        ? detailed.variants.firstWhere(
            (v) => v.isAvailable && v.stock > 0,
            orElse: () => detailed!.variants.first,
          )
        : null;

    setState(() {
      _loadingProduct = false;
      _product = detailed;
      _variantId = firstAvailable?.id;
      _error = null;
      if (_codBlocked && _payment == 'Cash on delivery' && widget.paymentMethods.isNotEmpty) {
        _payment = widget.paymentMethods.first.name;
      }
    });
  }

  String get _strategy =>
      _resolveStrategy(widget.paymentStrategy, _product?.paymentStrategyOverride);

  bool get _isOverride =>
      _isStrategyOverride(widget.paymentStrategy, _product?.paymentStrategyOverride);

  double? get _shipping {
    final text = _shippingController.text.trim();
    if (text.isEmpty) return null;
    return double.tryParse(text);
  }

  bool get _upfrontRequired => _requiresUpfront(_strategy, _shipping);

  bool get _codBlocked => _strategy == 'full_prepaid' || _upfrontRequired;

  PaymentMethodModel? get _chosenMethod {
    for (final method in widget.paymentMethods) {
      if (method.name == _payment) return method;
    }
    return null;
  }

  bool get _needsTransaction => _chosenMethod?.requiresTransactionId == true;

  bool get _showTransaction =>
      _needsTransaction ||
      _upfrontRequired ||
      _txnController.text.trim().isNotEmpty;

  Future<void> _submit() async {
    appDiagnostics.recordMessage('Inbox order', 'Create order tapped');

    if (!_formKey.currentState!.validate()) {
      setState(() => _error = 'Check the highlighted fields before creating the order.');
      return;
    }
    if (_product == null) return;
    if (_product!.variants.isNotEmpty && (_variantId == null || _variantId!.isEmpty)) {
      setState(() => _error = 'Choose which variant the customer is ordering.');
      return;
    }

    if (_codBlocked && (_payment == 'Cash on delivery' || _chosenMethod == null)) {
      setState(() {
        _error = widget.paymentMethods.isEmpty
            ? '${_strategyLabel(_strategy)}: this product needs payment before ordering, but the store has no prepaid method configured. Add one on the Payments page.'
            : '${_strategyLabel(_strategy)}: choose one of the store\'s prepaid methods (${widget.paymentMethods.map((m) => m.name).join(', ')}) — cash on delivery alone cannot place this order.';
      });
      return;
    }
    if ((_needsTransaction || _upfrontRequired) && _txnController.text.trim().isEmpty) {
      setState(() {
        _error = _upfrontRequired
            ? '${_strategyLabel(_strategy)} orders need the transaction id from the customer\'s upfront payment before the order can be created.'
            : '$_payment orders need the transaction id from the customer.';
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    final count = int.tryParse(_countController.text.trim()) ?? 1;
    final shipping = _shipping;
    final payload = <String, dynamic>{
      'productId': _product!.id,
      if (_variantId != null && _variantId!.isNotEmpty) 'variantId': _variantId,
      'count': count,
      'customerName': _nameController.text.trim().isEmpty
          ? (widget.customerName.isNotEmpty ? widget.customerName : 'Customer')
          : _nameController.text.trim(),
      'customerPhone': _phoneController.text.trim(),
      'customerAddress': _addressController.text.trim(),
      if (shipping != null && shipping >= 0) 'shippingCost': shipping,
      'paymentMethod': _payment,
      if (_txnController.text.trim().isNotEmpty) 'transactionId': _txnController.text.trim(),
    };

    final inbox = context.read<InboxProvider>();
    final result = await inbox.createConversationOrder(
      widget.businessId,
      widget.conversationId,
      payload,
    );
    if (!mounted) return;
    if (result == null) {
      setState(() {
        _busy = false;
        _error = inbox.errorMessage ?? 'The order could not be created';
      });
      return;
    }

    setState(() {
      _busy = false;
      _result = result;
    });
    appDiagnostics.recordMessage(
      'Inbox order',
      'Order created: ${result['id']}',
    );
  }

  Future<void> _sendOrderCard() async {
    final orderId = _result?['id']?.toString();
    if (orderId == null) return;
    setState(() => _orderCardBusy = true);
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendSuggestion(
      widget.businessId,
      widget.conversationId,
      {'kind': 'order_card', 'orderId': orderId},
    );
    if (!mounted) return;
    setState(() {
      _orderCardBusy = false;
      _orderCardSent = ok;
      if (!ok) _error = inbox.suggestionError ?? 'Could not send the track card';
    });
  }

  void _close({bool openOrder = false}) {
    final orderId = _result?['id']?.toString();
    Navigator.pop(
      context,
      _ToolResult.success(
        _orderCardSent ? 'Order created · track card sent' : 'Order created',
        openOrderId: openOrder ? orderId : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.88,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        'Make order',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Find the product, choose the variant and confirm the order details.',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: _busy ? null : () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.dangerBg,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: AppTheme.danger.withValues(alpha: 0.3)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                      fontSize: 11, height: 1.35, color: AppTheme.danger),
                ),
              ),
              const SizedBox(height: 8),
            ],
            Expanded(
              child: _result != null
                  ? _buildResult(isDark)
                  : _product == null
                      ? _buildProductPicker(isDark)
                      : _buildOrderForm(isDark),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductPicker(bool isDark) {
    if (_loadingProduct) {
      return const Center(child: CircularProgressIndicator());
    }
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                onSubmitted: _search,
                decoration: const InputDecoration(
                  hintText: 'Search products by name or SKU...',
                  isDense: true,
                  prefixIcon: Icon(Icons.search, size: 18),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
                style: const TextStyle(fontSize: 12),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () => _search(_searchController.text),
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                textStyle:
                    const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
              ),
              child: const Text('Search'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _loadingSearch
              ? const Center(child: CircularProgressIndicator())
              : _results.isEmpty
                  ? const Center(
                      child: Text(
                        'No products found.',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (_, index) {
                        final item = _results[index];
                        return InkWell(
                          onTap: () => _loadProduct(item.id),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isDark
                                    ? AppTheme.borderDark
                                    : AppTheme.borderLight,
                              ),
                            ),
                            child: Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: item.imageUrl != null
                                      ? CachedNetworkImage(
                                          imageUrl: item.imageUrl!,
                                          width: 40,
                                          height: 40,
                                          fit: BoxFit.cover,
                                          errorWidget: (_, __, ___) =>
                                              _placeholder(),
                                        )
                                      : _placeholder(),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${_money(item.price)} · ${item.variantCount} variant'
                                        '${item.variantCount == 1 ? '' : 's'}',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: isDark
                                              ? AppTheme.textDarkSecondary
                                              : Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    size: 18, color: Colors.grey),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Widget _placeholder() {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      color: Colors.grey.shade100,
      child: Icon(Icons.inventory_2_outlined, size: 18, color: Colors.grey.shade400),
    );
  }

  Widget _buildOrderForm(bool isDark) {
    final product = _product!;
    return SingleChildScrollView(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    product.name,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _product = null;
                            _variantId = null;
                            _result = null;
                          }),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    minimumSize: const Size(0, 28),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    '← Choose another product',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Payment strategy banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _isOverride
                    ? Colors.amber.withValues(alpha: 0.15)
                    : (isDark ? AppTheme.cardDark : Colors.grey.shade100),
                borderRadius: BorderRadius.circular(10),
                border: _isOverride
                    ? Border.all(color: Colors.amber.shade400)
                    : null,
              ),
              child: Text(
                'Payment: ${_strategyLabel(_strategy)}'
                '${_isOverride ? ' — overrides the store default.' : ''}\n'
                '${_strategyDescription(_strategy)}'
                '${_strategy == 'delivery_prepaid' ? ' Enter the delivery charge as Shipping, choose a prepaid method for it, and record its transaction id.' : ''}'
                '${_strategy == 'full_prepaid' ? ' Choose a prepaid method and record its transaction id; cash on delivery alone cannot create this order.' : ''}',
                style: const TextStyle(fontSize: 11, height: 1.4),
              ),
            ),
            const SizedBox(height: 12),

            if (product.variants.isNotEmpty)
              DropdownButtonFormField<String>(
                value: _variantId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Variant'),
                items: product.variants.map((variant) {
                  final disabled = !variant.isAvailable || variant.stock <= 0;
                  return DropdownMenuItem<String>(
                    value: variant.id,
                    enabled: !disabled,
                    child: Text(
                      '${variant.name} — ${_money(variant.price)} · ${variant.stock} left',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: disabled ? Colors.grey : null,
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (value) => setState(() => _variantId = value),
                validator: (value) {
                  if (product.variants.isEmpty) return null;
                  return value == null || value.isEmpty ? 'Choose a variant' : null;
                },
              ),
            if (product.variants.isNotEmpty) const SizedBox(height: 10),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _countController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Quantity'),
                    validator: (value) {
                      final n = int.tryParse((value ?? '').trim());
                      if (n == null || n <= 0) return 'Minimum 1';
                      if (n > 999) return 'Maximum 999';
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _shippingController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Shipping (৳)',
                      hintText: '0',
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (value) {
                      final text = (value ?? '').trim();
                      if (text.isEmpty) return null;
                      final amount = double.tryParse(text);
                      if (amount == null || amount < 0) return 'Invalid amount';
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            DropdownButtonFormField<String>(
              value: _payment,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Payment method'),
              items: [
                DropdownMenuItem<String>(
                  value: 'Cash on delivery',
                  enabled: !_codBlocked,
                  child: Text(
                    'Cash on delivery${_codBlocked ? ' (not enough for this product)' : ''}',
                    style: TextStyle(
                      fontSize: 12,
                      color: _codBlocked ? Colors.grey : null,
                    ),
                  ),
                ),
                ...widget.paymentMethods.map((method) => DropdownMenuItem<String>(
                      value: method.name,
                      child: Text(method.name, style: const TextStyle(fontSize: 12)),
                    )),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() => _payment = value);
              },
            ),
            if (_codBlocked && widget.paymentMethods.isEmpty) ...[
              const SizedBox(height: 6),
              const Text(
                'This product needs payment before ordering, but the store has no prepaid method configured. Add one on the Payments page.',
                style: TextStyle(fontSize: 10, color: AppTheme.danger),
              ),
            ],
            if (_chosenMethod?.info != null &&
                _chosenMethod!.info!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                '${_chosenMethod!.name} money goes to: ${_chosenMethod!.info}',
                style: TextStyle(
                  fontSize: 10,
                  color: isDark
                      ? AppTheme.textDarkSecondary
                      : Colors.grey.shade600,
                ),
              ),
            ],
            if (_showTransaction) ...[
              const SizedBox(height: 10),
              TextFormField(
                controller: _txnController,
                decoration: InputDecoration(
                  labelText: _upfrontRequired
                      ? 'Transaction ID (upfront payment)'
                      : _needsTransaction
                          ? 'Transaction ID'
                          : 'Transaction ID (optional)',
                  hintText: 'TrxID from the customer',
                ),
                validator: (value) {
                  if (!_needsTransaction && !_upfrontRequired) return null;
                  return (value ?? '').trim().isEmpty
                      ? 'Enter the transaction ID'
                      : null;
                },
              ),
            ],
            const SizedBox(height: 10),
            TextFormField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Customer name'),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Enter the customer name'
                  : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone',
                hintText: '01XXXXXXXXX',
              ),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Enter the customer phone'
                  : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _addressController,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Address'),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Enter the delivery address'
                  : null,
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox(
                        width: 13,
                        height: 13,
                        child: CircularProgressIndicator(
                            strokeWidth: 1.8, color: Colors.white),
                      )
                    : const Icon(Icons.shopping_cart_outlined, size: 16),
                label: const Text('Create order'),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Widget _buildResult(bool isDark) {
    final total = _result?['totalPrice'];
    final totalValue = total is num
        ? total.toDouble()
        : double.tryParse(total?.toString() ?? '') ?? 0;
    return ListView(
      children: [
        const SizedBox(height: 10),
        const Text(
          'Order created',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppTheme.success,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Total ${_money(totalValue)} · linked to this conversation and customer.',
          style: TextStyle(
            fontSize: 12,
            color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade600,
          ),
        ),
        const SizedBox(height: 14),
        if (_orderCardSent)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.successBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: AppTheme.success.withValues(alpha: 0.3)),
            ),
            child: const Text(
              'Track card sent to the customer.',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.success,
              ),
            ),
          )
        else
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Send the order track card to this customer?',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                const Text(
                  'It shows the item photo, status, total and order date.',
                  style: TextStyle(fontSize: 10, color: Colors.grey),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    ElevatedButton.icon(
                      onPressed: _orderCardBusy ? null : _sendOrderCard,
                      icon: _orderCardBusy
                          ? const SizedBox(
                              width: 12,
                              height: 12,
                              child: CircularProgressIndicator(
                                  strokeWidth: 1.8, color: Colors.white),
                            )
                          : const Icon(Icons.send, size: 14),
                      label: const Text('Yes, send it'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        textStyle: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: _orderCardBusy ? null : () => _close(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        textStyle: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                      child: const Text('Don\'t send'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        Row(
          children: [
            OutlinedButton(
              onPressed: () => _close(openOrder: true),
              child: const Text('Open order'),
            ),
            const SizedBox(width: 10),
            TextButton(
              onPressed: () => _close(),
              child: const Text('Close'),
            ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Customer details sheet (the web's right sidebar)
// ---------------------------------------------------------------------------

class _CustomerDetailsSheet extends StatelessWidget {
  final ConversationModel conversation;
  final ChannelModel? channel;
  final List<MessageModel> messages;

  const _CustomerDetailsSheet({
    required this.conversation,
    required this.channel,
    required this.messages,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final platform = channel?.platform == 'instagram'
        ? 'Instagram'
        : channel?.platform == 'facebook'
            ? 'Facebook Page'
            : 'Channel';
    final recent = messages.reversed.take(4).toList();

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          const Text(
            'CUSTOMER DETAILS',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: Colors.grey,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  conversation.initials,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.displayName,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      conversation.pageName ?? platform,
                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 22),
          _DetailRow(label: 'Platform', value: platform),
          const SizedBox(height: 8),
          if (channel != null)
            _DetailRow(
              label: 'Channel',
              value: channel!.pageName ?? channel!.platformChannelId ?? '—',
            ),
          const SizedBox(height: 8),
          _DetailRow(
            label: 'Customer Platform ID',
            value: conversation.customerPlatformId ?? '—',
            mono: true,
          ),
          const SizedBox(height: 8),
          _DetailRow(
            label: 'Conversation started',
            value: _startedLabel(conversation),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              const Text(
                'RECENT ACTIVITY',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: Colors.grey,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${messages.length}',
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (recent.isEmpty)
            const Text(
              'No recent activity.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            )
          else
            ...recent.map((message) => Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        margin: const EdgeInsets.only(top: 5),
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: AppTheme.primaryColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              message.content.isEmpty
                                  ? 'Photo attachment'
                                  : message.content,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, height: 1.35),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              _activityTime(message.time),
                              style: const TextStyle(
                                fontSize: 9,
                                color: Colors.grey,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }

  String _startedLabel(ConversationModel conversation) {
    final at = conversation.createdAt;
    if (at == null) return '—';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[at.month - 1]} ${at.day}, ${at.year}';
  }

  String _activityTime(DateTime at) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    final suffix = at.hour < 12 ? 'AM' : 'PM';
    return '${months[at.month - 1]} ${at.day}, $hour12:$minute $suffix';
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;

  const _DetailRow({
    required this.label,
    required this.value,
    this.mono = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 9,
            color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade500,
          ),
        ),
        const SizedBox(height: 2),
        SelectableText(
          value,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            fontFamily: mono ? 'monospace' : null,
          ),
        ),
      ],
    );
  }
}
