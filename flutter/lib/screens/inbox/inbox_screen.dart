import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/conversation.dart';
import '../../providers/business_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/status_badge.dart';
import 'chat_thread_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final inbox = context.watch<InboxProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final convs = inbox.conversations;

    return Scaffold(
      body: Column(
        children: [
          // Filter & Search Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
            child: Column(
              children: [
                // Search bar
                TextField(
                  controller: _searchController,
                  onChanged: (q) => inbox.setSearchQuery(q),
                  decoration: InputDecoration(
                    hintText: 'Search customer conversations...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              inbox.setSearchQuery('');
                            },
                          )
                        : null,
                  ),
                ),
                const SizedBox(height: 10),

                // Channel Filter & Status Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _filterChip(
                        label: 'All Channels',
                        selected: inbox.selectedChannelId == null,
                        onTap: () => inbox.setChannelFilter(null),
                      ),
                      const SizedBox(width: 6),
                      ...biz.channels.map((ch) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: _filterChip(
                            label: ch.displayName,
                            icon: ch.iconData,
                            iconColor: ch.brandColor,
                            selected: inbox.selectedChannelId == ch.id,
                            onTap: () => inbox.setChannelFilter(ch.id),
                          ),
                        );
                      }),
                      const SizedBox(width: 8),
                      Container(height: 20, width: 1, color: Colors.grey.shade300),
                      const SizedBox(width: 8),
                      _filterChip(
                        label: 'Pending',
                        selected: inbox.selectedStateFilter == 'pending',
                        onTap: () => inbox.setStateFilter(
                          inbox.selectedStateFilter == 'pending' ? 'all' : 'pending',
                        ),
                      ),
                      const SizedBox(width: 6),
                      _filterChip(
                        label: 'Resolved',
                        selected: inbox.selectedStateFilter == 'done',
                        onTap: () => inbox.setStateFilter(
                          inbox.selectedStateFilter == 'done' ? 'all' : 'done',
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Conversation List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                if (currentStore != null) {
                  await inbox.fetchConversations(currentStore.id);
                }
              },
              child: inbox.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : convs.isEmpty
                      ? EmptyState(
                          icon: Icons.chat_bubble_outline,
                          title: 'No Conversations Found',
                          description:
                              'Customer chats from Facebook Messenger, WhatsApp, or Instagram will automatically appear here.',
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          itemCount: convs.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final conv = convs[index];
                            final isPending = conv.lastMessageState != 'done';

                            return AppCard(
                              onTap: () {
                                inbox.selectConversation(conv);
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ChatThreadScreen(
                                      conversation: conv,
                                      businessId: currentStore?.id ?? '',
                                    ),
                                  ),
                                );
                              },
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Avatar with brand badge
                                  Stack(
                                    children: [
                                      CircleAvatar(
                                        radius: 24,
                                        backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                                        child: Text(
                                          (conv.customerName ?? 'C').substring(0, 1).toUpperCase(),
                                          style: const TextStyle(
                                            color: AppTheme.primaryColor,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16,
                                          ),
                                        ),
                                      ),
                                      Positioned(
                                        right: 0,
                                        bottom: 0,
                                        child: Container(
                                          padding: const EdgeInsets.all(2),
                                          decoration: BoxDecoration(
                                            color: Colors.white,
                                            shape: BoxShape.circle,
                                            boxShadow: [
                                              BoxShadow(
                                                color: Colors.black.withValues(alpha: 0.1),
                                                blurRadius: 4,
                                              ),
                                            ],
                                          ),
                                          child: Icon(
                                            Icons.facebook,
                                            size: 14,
                                            color: const Color(0xFF1877F2),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(width: 12),

                                  // Customer & message preview
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Expanded(
                                              child: Text(
                                                conv.customerName ?? 'Customer',
                                                style: TextStyle(
                                                  fontWeight: isPending ? FontWeight.bold : FontWeight.w600,
                                                  fontSize: 15,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            Text(
                                              conv.createdAt != null
                                                  ? '${conv.createdAt!.hour}:${conv.createdAt!.minute.toString().padLeft(2, '0')}'
                                                  : 'Now',
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: Colors.grey.shade500,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          conv.lastMessageText ?? 'Click to view customer conversation',
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: isPending
                                                ? (isDark ? Colors.white : Colors.black87)
                                                : Colors.grey.shade600,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 8),

                                        // Status & Autopilot tags
                                        Row(
                                          children: [
                                            StatusBadge(status: conv.lastMessageState),
                                            const SizedBox(width: 6),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: conv.autoPilot
                                                    ? AppTheme.primaryColor.withValues(alpha: 0.1)
                                                    : Colors.grey.withValues(alpha: 0.12),
                                                borderRadius: BorderRadius.circular(12),
                                              ),
                                              child: Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  Icon(
                                                    conv.autoPilot ? Icons.smart_toy : Icons.person,
                                                    size: 11,
                                                    color: conv.autoPilot
                                                        ? AppTheme.primaryColor
                                                        : Colors.grey.shade700,
                                                  ),
                                                  const SizedBox(width: 4),
                                                  Text(
                                                    conv.autoPilot ? 'AI Active' : 'Human Takeover',
                                                    style: TextStyle(
                                                      fontSize: 10,
                                                      fontWeight: FontWeight.bold,
                                                      color: conv.autoPilot
                                                          ? AppTheme.primaryColor
                                                          : Colors.grey.shade700,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip({
    required String label,
    IconData? icon,
    Color? iconColor,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primaryColor
              : (Theme.of(context).brightness == Brightness.dark
                  ? AppTheme.cardDark
                  : Colors.grey.shade100),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primaryColor : Colors.transparent,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: selected ? Colors.white : iconColor),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.bold : FontWeight.w500,
                color: selected ? Colors.white : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
