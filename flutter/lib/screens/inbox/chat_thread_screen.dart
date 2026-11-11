import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/conversation.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/products_provider.dart';
import '../orders/create_order_screen.dart';

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

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InboxProvider>().fetchMessages(widget.businessId, widget.conversation.id);
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  void _handleSend() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    _messageController.clear();
    final inbox = context.read<InboxProvider>();
    final ok = await inbox.sendMessage(widget.businessId, widget.conversation.id, text);
    if (ok) {
      _scrollToBottom();
    }
  }

  void _showToolsModal() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.add_shopping_cart, color: Colors.green),
                ),
                title: const Text('Create Order for Customer', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Pre-fills customer details extracted from chat history'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CreateOrderScreen(
                        businessId: widget.businessId,
                        initialCustomerName: widget.conversation.customerName,
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.auto_awesome, color: AppTheme.primaryColor),
                ),
                title: const Text('Generate AI Suggestions', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Let Gemini analyze context and generate 3 sales replies'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.read<InboxProvider>().generateSuggestions(
                        widget.businessId,
                        widget.conversation.id,
                      );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final inbox = context.watch<InboxProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final conv = inbox.activeConversation ?? widget.conversation;
    final messages = inbox.activeMessages;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
              child: Text(
                (conv.customerName ?? 'C').substring(0, 1).toUpperCase(),
                style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold, fontSize: 14),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conv.customerName ?? 'Customer',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    conv.pageName ?? 'Facebook Messenger',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Per-Thread Autopilot Switch
          Tooltip(
            message: conv.autoPilot ? 'AI Auto-Pilot Enabled' : 'Human Takeover Mode',
            child: Row(
              children: [
                Icon(
                  conv.autoPilot ? Icons.smart_toy : Icons.person,
                  size: 16,
                  color: conv.autoPilot ? AppTheme.primaryColor : Colors.grey,
                ),
                const SizedBox(width: 4),
                Switch(
                  value: conv.autoPilot,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (_) => inbox.toggleAutopilot(widget.businessId, conv.id),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Message Bubbles List
          Expanded(
            child: inbox.isLoadingMessages
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                    ? Center(
                        child: Text(
                          'No messages in thread yet',
                          style: TextStyle(color: Colors.grey.shade500),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final msg = messages[index];
                          final isMe = msg.isFromSelf || msg.isFromAgent;

                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              constraints: BoxConstraints(
                                maxWidth: MediaQuery.of(context).size.width * 0.78,
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: isMe
                                    ? AppTheme.primaryColor
                                    : (isDark ? AppTheme.cardDark : Colors.grey.shade100),
                                borderRadius: BorderRadius.circular(16).copyWith(
                                  bottomRight: isMe ? const Radius.circular(2) : const Radius.circular(16),
                                  bottomLeft: !isMe ? const Radius.circular(2) : const Radius.circular(16),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment:
                                    isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                children: [
                                  if (msg.isFromAgent) ...[
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.smart_toy, size: 10, color: Colors.white70),
                                        const SizedBox(width: 4),
                                        Text(
                                          'AI Agent',
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white.withValues(alpha: 0.8),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                  ],
                                  Text(
                                    msg.content,
                                    style: TextStyle(
                                      color: isMe ? Colors.white : (isDark ? Colors.white : Colors.black87),
                                      fontSize: 14,
                                      height: 1.35,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${msg.time.hour}:${msg.time.minute.toString().padLeft(2, '0')}',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: isMe ? Colors.white70 : Colors.grey.shade500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),

          // AI Suggestion Banner
          if (inbox.isGeneratingSuggestions)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppTheme.primaryColor.withValues(alpha: 0.08),
              child: const Row(
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primaryColor),
                  ),
                  SizedBox(width: 10),
                  Text(
                    'Gemini is drafting suggested replies...',
                    style: TextStyle(fontSize: 12, color: AppTheme.primaryColor, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            )
          else if (inbox.suggestions.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: AppTheme.primaryColor.withValues(alpha: 0.06),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.auto_awesome, size: 14, color: AppTheme.primaryColor),
                          SizedBox(width: 6),
                          Text(
                            'AI Suggested Quick Replies:',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 16),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => inbox.clearSuggestions(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: inbox.suggestions.map((s) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ActionChip(
                            label: Text(s.content, maxLines: 1, overflow: TextOverflow.ellipsis),
                            backgroundColor: isDark ? AppTheme.surfaceDark : Colors.white,
                            side: const BorderSide(color: AppTheme.primaryColor),
                            onPressed: () {
                              _messageController.text = s.content;
                            },
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),

          // Message Input Field & Toolbar
          Container(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
            decoration: BoxDecoration(
              color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
              border: Border(
                top: BorderSide(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
            ),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.add_circle_outline, color: AppTheme.primaryColor),
                  tooltip: 'Actions & Order Tools',
                  onPressed: _showToolsModal,
                ),
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    maxLines: 4,
                    minLines: 1,
                    decoration: InputDecoration(
                      hintText: 'Type reply message...',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                      filled: true,
                      fillColor: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                    ),
                    onSubmitted: (_) => _handleSend(),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(
                  icon: inbox.isSending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.send, size: 18),
                  style: IconButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: inbox.isSending ? null : _handleSend,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
