import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../models/conversation.dart';
import '../../providers/business_provider.dart';
import '../../providers/inbox_provider.dart';
import 'chat_thread_screen.dart';

/// The web inbox list: channel filter, search, All/Open/Resolved tabs, per-row
/// checkboxes and bulk delete. Opening a row is the web's right-hand chat pane.
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  final _searchController = TextEditingController();
  final Set<String> _selected = {};
  String? _openConversationId;
  Timer? _refreshTimer;
  bool _fetchingInBackground = false;

  @override
  void initState() {
    super.initState();
    _startPeriodicRefresh();
  }

  void _startPeriodicRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (!mounted || _openConversationId != null || _fetchingInBackground) return;
      final store = context.read<BusinessProvider>().currentBusiness;
      if (store == null) return;
      _fetchingInBackground = true;
      try {
        await context.read<InboxProvider>().fetchConversations(store.id, silent: true);
      } finally {
        _fetchingInBackground = false;
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refresh(String businessId) async {
    await context.read<InboxProvider>().fetchConversations(businessId);
  }

  void _changeChannel(String? channelId) {
    final store = context.read<BusinessProvider>().currentBusiness;
    final inbox = context.read<InboxProvider>();
    setState(() => _selected.clear());
    inbox.setChannelFilter(channelId);
    if (store != null) inbox.fetchConversations(store.id);
  }

  Future<void> _openChat(ConversationModel conversation) async {
    final store = context.read<BusinessProvider>().currentBusiness;
    if (store == null) return;
    final inbox = context.read<InboxProvider>();
    inbox.selectConversation(conversation);
    setState(() => _openConversationId = conversation.id);
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatThreadScreen(
          conversation: conversation,
          businessId: store.id,
        ),
      ),
    );
    if (!mounted) return;
    setState(() => _openConversationId = null);
    await inbox.fetchConversations(store.id);
  }

  void _toggle(String id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else {
        _selected.add(id);
      }
    });
  }

  void _toggleAll(List<ConversationModel> visible) {
    setState(() {
      final allSelected =
          visible.isNotEmpty && visible.every((c) => _selected.contains(c.id));
      if (allSelected) {
        for (final c in visible) {
          _selected.remove(c.id);
        }
      } else {
        for (final c in visible) {
          _selected.add(c.id);
        }
      }
    });
  }

  Future<void> _bulkDelete(String businessId) async {
    if (_selected.isEmpty) return;
    final count = _selected.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete $count conversation${count == 1 ? '' : 's'}?'),
        content: const Text(
          'The selected conversations and their messages will be removed. '
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

    final ids = _selected.toList();
    setState(() => _selected.clear());
    final deleted =
        await context.read<InboxProvider>().deleteConversations(businessId, ids);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          deleted == ids.length
              ? 'Deleted $deleted conversation${deleted == 1 ? '' : 's'}'
              : 'Deleted $deleted of ${ids.length} conversations',
        ),
        backgroundColor: deleted > 0 ? AppTheme.success : AppTheme.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final inbox = context.watch<InboxProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final channels = biz.channels;

    final all = inbox.allConversations;
    final visible = inbox.conversations;
    final query = inbox.searchQuery.trim();
    final activeChannel = channels.where((c) => c.id == inbox.selectedChannelId);
    final activeChannelName =
        activeChannel.isNotEmpty ? _channelName(activeChannel.first) : null;

    final allSelected =
        visible.isNotEmpty && visible.every((c) => _selected.contains(c.id));
    final someSelected =
        visible.any((c) => _selected.contains(c.id)) && !allSelected;

    return RefreshIndicator(
      onRefresh: () async {
        if (currentStore != null) await _refresh(currentStore.id);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Row(
            children: [
              Text(
                'Inbox',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                  color: isDark ? Colors.white : AppTheme.textLightPrimary,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${all.length}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
              const Spacer(),
              if (activeChannelName != null)
                TextButton(
                  onPressed: () => _changeChannel(null),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 30),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'All channels',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),

          if (inbox.errorMessage != null) ...[
            _ErrorStrip(message: inbox.errorMessage!),
            const SizedBox(height: 12),
          ],

          if (channels.isNotEmpty) ...[
            _ChannelFilter(
              channels: channels,
              selectedId: inbox.selectedChannelId,
              isDark: isDark,
              onChanged: _changeChannel,
            ),
            const SizedBox(height: 10),
          ],

          TextField(
            controller: _searchController,
            onChanged: inbox.setSearchQuery,
            decoration: InputDecoration(
              hintText: activeChannelName != null
                  ? 'Search $activeChannelName...'
                  : 'Search conversations...',
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            ),
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 12),

          // Tabs
          Row(
            children: [
              _TabButton(
                label: 'All',
                count: all.length,
                selected: inbox.selectedStateFilter == 'all',
                onTap: () => inbox.setStateFilter('all'),
              ),
              const SizedBox(width: 4),
              _TabButton(
                label: 'Open',
                count: inbox.openCount,
                selected: inbox.selectedStateFilter == 'open',
                onTap: () => inbox.setStateFilter('open'),
              ),
              const SizedBox(width: 4),
              _TabButton(
                label: 'Resolved',
                count: inbox.resolvedCount,
                selected: inbox.selectedStateFilter == 'done',
                onTap: () => inbox.setStateFilter('done'),
              ),
            ],
          ),

          if (_selected.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Text(
                    '${_selected.length} selected',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: currentStore == null
                        ? null
                        : () => _bulkDelete(currentStore.id),
                    icon: const Icon(Icons.delete_outline, size: 16),
                    label: const Text('Delete'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.danger,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      textStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 6),

          if (inbox.isLoading && all.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (visible.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
              child: Column(
                children: [
                  Icon(Icons.inbox_outlined, size: 36, color: Colors.grey.shade400),
                  const SizedBox(height: 10),
                  Text(
                    query.isNotEmpty
                        ? 'No matching conversations'
                        : inbox.allConversations.isEmpty
                            ? (activeChannelName != null
                                ? 'No chats from $activeChannelName yet'
                                : 'No conversations yet')
                            : 'No matches in this view',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    query.isNotEmpty
                        ? 'Try another name, Page or account.'
                        : inbox.allConversations.isEmpty
                            ? (activeChannelName != null
                                ? 'Pick another channel or switch back to All channels to see every conversation.'
                                : 'Connect your Facebook Page in Integrations. When customers send messages, they appear here live.')
                            : 'Switch the Open or Resolved tab to see the rest.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 11,
                      height: 1.4,
                      color: Colors.grey,
                    ),
                  ),
                  if (activeChannelName != null && query.isEmpty) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => _changeChannel(null),
                      child: const Text(
                        'Show all channels',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                  if (inbox.allConversations.isEmpty &&
                      activeChannelName == null) ...[
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const _IntegrationsHintScreen(),
                        ),
                      ),
                      child: const Text('Go to Integrations'),
                    ),
                  ],
                ],
              ),
            )
          else ...[
            ...visible.map((conversation) => _ConversationRow(
                  conversation: conversation,
                  isDark: isDark,
                  selected: _selected.contains(conversation.id),
                  active: _openConversationId == conversation.id,
                  onToggle: () => _toggle(conversation.id),
                  onTap: () => _openChat(conversation),
                )),
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: allSelected
                        ? true
                        : (someSelected ? null : false),
                    tristate: true,
                    onChanged: (_) => _toggleAll(visible),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  'Select visible conversations',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark
                        ? AppTheme.textDarkSecondary
                        : AppTheme.textLightSecondary,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _channelName(ChannelModel channel) {
    final page = channel.pageName;
    if (page != null && page.trim().isNotEmpty) return page;
    return channel.platformChannelId ?? channel.platform;
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _TabButton({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: selected ? AppTheme.primaryColor : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected
                    ? AppTheme.primaryColor
                    : (isDark
                        ? AppTheme.textDarkSecondary
                        : AppTheme.textLightSecondary),
              ),
            ),
            const SizedBox(width: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '$count',
                style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConversationRow extends StatelessWidget {
  final ConversationModel conversation;
  final bool isDark;
  final bool selected;
  final bool active;
  final VoidCallback onToggle;
  final VoidCallback onTap;

  const _ConversationRow({
    required this.conversation,
    required this.isDark,
    required this.selected,
    required this.active,
    required this.onToggle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final open = conversation.isOpen;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 10),
        decoration: BoxDecoration(
          color: active
              ? AppTheme.primaryColor.withValues(alpha: 0.07)
              : Colors.transparent,
          border: Border(
            bottom: BorderSide(
              color: isDark ? AppTheme.borderDark : Colors.grey.shade100,
            ),
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 26,
              height: 26,
              child: Checkbox(
                value: selected,
                onChanged: (_) => onToggle(),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ),
            const SizedBox(width: 6),
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: isDark
                          ? [const Color(0xFF262A4D), const Color(0xFF34305F)]
                          : [const Color(0xFFE0E7FF), const Color(0xFFDDD6FE)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Text(
                    conversation.initials,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? const Color(0xFFC7D2FE)
                          : const Color(0xFF4338CA),
                    ),
                  ),
                ),
                if (open)
                  Positioned(
                    right: -1,
                    bottom: -1,
                    child: Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        color: AppTheme.success,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isDark ? AppTheme.surfaceDark : Colors.white,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conversation.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: active ? AppTheme.primaryColor : null,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        conversation.createdLabel,
                        style: const TextStyle(
                          fontSize: 9,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${conversation.pageName ?? 'Messenger'} · ${conversation.statusLabel}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark
                                ? AppTheme.textDarkSecondary
                                : AppTheme.textLightSecondary,
                          ),
                        ),
                      ),
                      if (open)
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: AppTheme.primaryColor,
                            shape: BoxShape.circle,
                          ),
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

class _ChannelFilter extends StatelessWidget {
  final List<ChannelModel> channels;
  final String? selectedId;
  final bool isDark;
  final ValueChanged<String?> onChanged;

  const _ChannelFilter({
    required this.channels,
    required this.selectedId,
    required this.isDark,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          value: selectedId,
          isExpanded: true,
          items: [
            DropdownMenuItem<String?>(
              value: null,
              child: Row(
                children: [
                  Icon(Icons.layers_outlined,
                      size: 16, color: Colors.grey.shade500),
                  const SizedBox(width: 8),
                  const Text('All channels', style: TextStyle(fontSize: 12)),
                ],
              ),
            ),
            ...channels.map((channel) {
              return DropdownMenuItem<String?>(
                value: channel.id,
                child: Row(
                  children: [
                    _ChannelAvatar(channel: channel),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _channelName(channel),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    Text(
                      _platformLabel(channel.platform),
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              );
            }),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }

  String _channelName(ChannelModel channel) {
    final page = channel.pageName;
    if (page != null && page.trim().isNotEmpty) return page;
    return channel.platformChannelId ?? channel.platform;
  }

  String _platformLabel(String? platform) {
    switch (platform) {
      case 'instagram':
        return 'Instagram';
      case 'facebook':
        return 'Facebook Page';
      case 'whatsapp':
        return 'WhatsApp';
      default:
        return platform ?? 'Channel';
    }
  }
}

class _ChannelAvatar extends StatelessWidget {
  final ChannelModel channel;

  const _ChannelAvatar({required this.channel});

  @override
  Widget build(BuildContext context) {
    if (channel.isInstagram) {
      return Container(
        width: 24,
        height: 24,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            colors: [Color(0xFFFBBF24), Color(0xFFEC4899), Color(0xFF8B5CF6)],
            begin: Alignment.bottomLeft,
            end: Alignment.topRight,
          ),
        ),
        child: const Icon(Icons.camera_alt, size: 12, color: Colors.white),
      );
    }
    if (channel.isWhatsApp) {
      return Container(
        width: 24,
        height: 24,
        decoration: const BoxDecoration(
          color: Color(0xFF25D366),
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.chat, size: 12, color: Colors.white),
      );
    }
    return Container(
      width: 24,
      height: 24,
      decoration: const BoxDecoration(
        color: Color(0xFF1877F2),
        shape: BoxShape.circle,
      ),
      child: const Icon(Icons.facebook, size: 14, color: Colors.white),
    );
  }
}

class _ErrorStrip extends StatelessWidget {
  final String message;

  const _ErrorStrip({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.dangerBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 16, color: AppTheme.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 11,
                height: 1.35,
                color: AppTheme.danger,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The web's "Go to Integrations" link, landed on the app's own Channels screen
/// without importing the whole More menu stack into this list.
class _IntegrationsHintScreen extends StatelessWidget {
  const _IntegrationsHintScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Integrations')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.link, size: 48, color: AppTheme.primaryColor),
              const SizedBox(height: 12),
              const Text(
                'Connect a Facebook Page or Instagram account from the More tab to receive conversations here.',
                textAlign: TextAlign.center,
                style: TextStyle(height: 1.4),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Back to Inbox'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
