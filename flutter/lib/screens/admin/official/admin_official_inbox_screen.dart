import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../config/app_theme.dart';
import '../../../../providers/admin_provider.dart';
import 'official_migration_card.dart';
import 'official_ticket_detail_sheet.dart';

class AdminOfficialInboxScreen extends StatefulWidget {
  const AdminOfficialInboxScreen({super.key});

  @override
  State<AdminOfficialInboxScreen> createState() => _AdminOfficialInboxScreenState();
}

class _AdminOfficialInboxScreenState extends State<AdminOfficialInboxScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _conversations = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadConversations());
  }

  Future<void> _loadConversations() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();
    final rows = await admin.fetchOfficialConversations();

    if (mounted) {
      setState(() {
        _conversations = rows;
        _isLoading = false;
      });
    }
  }

  void _openThread(Map<String, dynamic> conversation) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => OfficialThreadSheet(
        conversationId: (conversation['id'] ?? '').toString(),
        initialData: conversation,
        onChanged: _loadConversations,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final migrationPending = context.watch<AdminProvider>().officialMigrationPending;

    return RefreshIndicator(
      onRefresh: _loadConversations,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.inbox_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Official Inbox',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Every person who messaged an official channel. The AI answers as a person while enabled; a taken-over thread stays yours until resumed.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 16),

          if (migrationPending) ...[
            const OfficialMigrationCard(),
            const SizedBox(height: 16),
          ],

          if (_isLoading) ...[
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          ] else if (_conversations.isEmpty) ...[
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Icon(Icons.inbox, size: 48, color: isDark ? Colors.white24 : Colors.black26),
                    const SizedBox(height: 12),
                    const Text('No conversations found', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(
                      'Customer DMs on Facebook, Instagram, or WhatsApp will appear here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            ..._conversations.map((conv) {
              final name = (conv['customerName'] ?? 'Unknown customer').toString();
              final platform = (conv['platform'] ?? 'facebook').toString();
              final contactId = (conv['customerPlatformId'] ?? '').toString();
              final status = (conv['status'] ?? 'pending').toString();
              final aiPaused = conv['aiPaused'] == true;
              final stateAt = (conv['stateAt'] ?? '').toString();

              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => _openThread(conv),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 18,
                              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : '?',
                                style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${platform.toUpperCase()} · $contactId',
                                    style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: (status == 'pending' ? Colors.amber : const Color(0xFF10B981)).withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    status.toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: status == 'pending' ? Colors.amber : const Color(0xFF10B981),
                                    ),
                                  ),
                                ),
                                if (aiPaused) ...[
                                  const SizedBox(height: 4),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AppTheme.danger.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      'TAKEN OVER',
                                      style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: AppTheme.danger),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                        if (stateAt.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Last activity: ${stateAt.split('T').first}',
                                style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                              ),
                              const Icon(Icons.chevron_right, size: 16),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

}

class OfficialThreadSheet extends StatefulWidget {
  final String conversationId;
  final Map<String, dynamic> initialData;
  final VoidCallback onChanged;

  const OfficialThreadSheet({
    required this.conversationId,
    required this.initialData,
    required this.onChanged,
  });

  @override
  State<OfficialThreadSheet> createState() => _OfficialThreadSheetState();
}

class _OfficialThreadSheetState extends State<OfficialThreadSheet> {
  bool _isLoading = true;
  Map<String, dynamic>? _conversation;
  List<Map<String, dynamic>> _messages = [];
  List<Map<String, dynamic>> _tickets = [];

  final _replyController = TextEditingController();
  bool _pauseAiOnReply = false;
  bool _isSending = false;
  bool _isTogglingTakeover = false;

  @override
  void initState() {
    super.initState();
    _conversation = widget.initialData;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadThread());
  }

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _loadThread() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();
    final thread = await admin.fetchOfficialThread(widget.conversationId);

    if (mounted) {
      if (thread != null) {
        _conversation = thread['conversation'] is Map ? Map<String, dynamic>.from(thread['conversation']) : widget.initialData;
        _messages = (thread['messages'] as List? ?? []).map((m) => Map<String, dynamic>.from(m as Map)).toList();
        _tickets = (thread['tickets'] as List? ?? []).map((t) => Map<String, dynamic>.from(t as Map)).toList();
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty || _isSending) return;

    setState(() => _isSending = true);
    final admin = context.read<AdminProvider>();
    final ok = await admin.replyOfficialThread(
      widget.conversationId,
      text,
      paused: _pauseAiOnReply ? true : null,
    );

    if (mounted) {
      setState(() => _isSending = false);
      if (ok) {
        _replyController.clear();
        widget.onChanged();
        _loadThread();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to send reply'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handleToggleTakeover() async {
    final currentPaused = _conversation?['aiPaused'] == true;
    setState(() => _isTogglingTakeover = true);

    final admin = context.read<AdminProvider>();
    final ok = await admin.takeoverOfficialConversation(widget.conversationId, !currentPaused);

    if (mounted) {
      setState(() => _isTogglingTakeover = false);
      if (ok) {
        setState(() {
          _conversation?['aiPaused'] = !currentPaused;
        });
        widget.onChanged();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final name = (_conversation?['customerName'] ?? 'Unknown customer').toString();
    final platform = (_conversation?['platform'] ?? '').toString();
    final aiPaused = _conversation?['aiPaused'] == true;

    return Container(
      height: MediaQuery.of(context).size.height * 0.88,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF191A29) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 8, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: isDark ? Colors.white24 : Colors.black12,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Sheet Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${platform.toUpperCase()} · ${aiPaused ? "Human Takeover Active" : "AI Auto-reply Active"}',
                          style: TextStyle(
                            fontSize: 11,
                            color: aiPaused ? AppTheme.danger : const Color(0xFF10B981),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: _isTogglingTakeover ? null : _handleToggleTakeover,
                    icon: Icon(aiPaused ? Icons.play_arrow : Icons.pause, size: 14),
                    label: Text(aiPaused ? 'Resume AI' : 'Take Over', style: const TextStyle(fontSize: 11)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: aiPaused ? const Color(0xFF10B981) : AppTheme.danger,
                      side: BorderSide(color: aiPaused ? const Color(0xFF10B981) : AppTheme.danger),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      minimumSize: Size.zero,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Messages List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _messages.isEmpty
                      ? const Center(child: Text('No messages recorded.'))
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final msg = _messages[index];
                            final from = (msg['from'] ?? 'customer').toString();
                            final isCustomer = from == 'customer';
                            final content = (msg['content'] ?? '').toString();
                            final time = (msg['time'] ?? '').toString();

                            return Align(
                              alignment: isCustomer ? Alignment.centerLeft : Alignment.centerRight,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 10),
                                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: BoxDecoration(
                                  color: isCustomer
                                      ? (isDark ? const Color(0xFF24263A) : const Color(0xFFF1F3F9))
                                      : AppTheme.primaryColor,
                                  borderRadius: BorderRadius.circular(16).copyWith(
                                    bottomLeft: isCustomer ? const Radius.circular(2) : null,
                                    bottomRight: !isCustomer ? const Radius.circular(2) : null,
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: isCustomer ? CrossAxisAlignment.start : CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      content,
                                      style: TextStyle(
                                        color: isCustomer ? (isDark ? Colors.white : Colors.black87) : Colors.white,
                                        fontSize: 13,
                                      ),
                                    ),
                                    if (time.isNotEmpty || !isCustomer) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        '${!isCustomer ? 'you via ${(msg['sentBy'] ?? 'console').toString()} · ' : ''}'
                                        '${time.isEmpty ? '' : (time.contains('T') && time.split('T').last.length >= 5 ? time.split('T').last.substring(0, 5) : time)}',
                                        style: TextStyle(
                                          color: isCustomer
                                              ? (isDark ? Colors.white38 : Colors.black38)
                                              : Colors.white70,
                                          fontSize: 9,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),

            if (_tickets.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                color: Colors.amber.withValues(alpha: 0.12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.support_agent, size: 14, color: Colors.amber),
                        const SizedBox(width: 6),
                        Text(
                          '${_tickets.length} linked support ticket(s)',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.amber),
                        ),
                      ],
                    ),
                    ..._tickets.map((t) => TextButton(
                          onPressed: () => showModalBottomSheet(
                            context: context,
                            isScrollControlled: true,
                            backgroundColor: Colors.transparent,
                            builder: (_) => OfficialTicketDetailSheet(
                              ticketId: (t['id'] ?? '').toString(),
                              onChanged: _loadThread,
                            ),
                          ),
                          child: Text(
                            '${t['type'] ?? 'ticket'} · ${t['subject'] ?? t['id'] ?? ''}',
                            style: const TextStyle(fontSize: 11),
                          ),
                        )),
                  ],
                ),
              ),

            // Bottom Reply Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF8FAFC),
                border: Border(top: BorderSide(color: isDark ? Colors.white10 : Colors.black12)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Checkbox(
                        value: _pauseAiOnReply,
                        visualDensity: VisualDensity.compact,
                        activeColor: AppTheme.primaryColor,
                        onChanged: (v) => setState(() => _pauseAiOnReply = v ?? false),
                      ),
                      const Text('Pause AI on this reply', style: TextStyle(fontSize: 11)),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _replyController,
                          decoration: InputDecoration(
                            hintText: 'Type official reply...',
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _isSending ? null : _handleSendReply,
                        icon: _isSending
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.send, size: 18),
                        style: IconButton.styleFrom(backgroundColor: AppTheme.primaryColor),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
