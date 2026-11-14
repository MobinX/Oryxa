import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/notification_item.dart';
import '../../providers/business_provider.dart';
import '../inbox/inbox_screen.dart';
import '../orders/orders_screen.dart';
import '../payments/payments_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  String _selectedTab = 'all'; // 'all' | 'unread'
  MessengerOverview? _messengerOverview;
  bool _loadingMessenger = false;
  bool _creatingCode = false;
  String? _removingFollowerId;
  bool _testingPush = false;
  bool _copiedCode = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  Future<void> _loadData() async {
    final biz = context.read<BusinessProvider>();
    await Future.wait([
      biz.fetchNotifications(),
      _loadMessengerOverview(),
    ]);
  }

  Future<void> _loadMessengerOverview() async {
    if (!mounted) return;
    setState(() => _loadingMessenger = true);
    try {
      final biz = context.read<BusinessProvider>();
      final overview = await biz.fetchMessengerOverview();
      if (mounted) {
        setState(() {
          _messengerOverview = overview;
          _loadingMessenger = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingMessenger = false);
    }
  }

  Future<void> _createCode() async {
    setState(() => _creatingCode = true);
    final biz = context.read<BusinessProvider>();
    final code = await biz.createMessengerCode();
    if (!mounted) return;
    setState(() => _creatingCode = false);
    if (code != null) {
      _loadMessengerOverview();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Messenger notification code generated!')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to generate Messenger code. Please retry.')),
      );
    }
  }

  Future<void> _copyCode(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    setState(() => _copiedCode = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Code copied to clipboard!')),
    );
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copiedCode = false);
    });
  }

  Future<void> _removeFollower(MessengerFollower follower) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove account'),
        content: Text(
          'Remove ${follower.name ?? "this Messenger account"} from notifications? It can be connected again with the code.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            child: const Text('Remove', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _removingFollowerId = follower.id);
    final biz = context.read<BusinessProvider>();
    final ok = await biz.removeMessengerFollower(follower.id);
    if (!mounted) return;
    setState(() => _removingFollowerId = null);

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Messenger account removed.')),
      );
      _loadMessengerOverview();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not remove that account.')),
      );
    }
  }

  Future<void> _runTestPush() async {
    setState(() => _testingPush = true);
    final biz = context.read<BusinessProvider>();
    final result = await biz.sendTestPush();
    if (!mounted) return;
    setState(() => _testingPush = false);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Icon(
              result.sent > 0 ? Icons.check_circle_outline : Icons.info_outline,
              color: result.sent > 0 ? Colors.green : AppTheme.primaryColor,
            ),
            const SizedBox(width: 8),
            const Text('Test Push Notification'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              result.summaryMessage,
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Tokens registered: ${result.tokens}', style: const TextStyle(fontSize: 12)),
                  Text('Sent: ${result.sent}', style: const TextStyle(fontSize: 12)),
                  Text('Failed: ${result.failed}', style: const TextStyle(fontSize: 12)),
                  Text('Removed: ${result.removed}', style: const TextStyle(fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _handleNotificationAction(NotificationItemModel item) {
    if (item.link == null || item.link!.isEmpty) return;

    if (item.kind == 'order_placed') {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const OrdersScreen()),
      );
    } else if (item.kind == 'payment_order_failed' || item.kind == 'human_help') {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const InboxScreen()),
      );
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const PaymentsScreen()),
      );
    }
  }

  IconData _iconForKind(String kind) {
    if (kind == 'order_placed') return Icons.shopping_bag_outlined;
    if (kind == 'payment_order_failed') return Icons.error_outline;
    if (kind == 'human_help') return Icons.support_agent_outlined;
    if (kind.endsWith('_100')) return Icons.hourglass_empty_rounded;
    if (kind.endsWith('_80')) return Icons.speed_rounded;
    return Icons.notifications_outlined;
  }

  Color _iconColorForKind(String kind) {
    if (kind == 'order_placed') return Colors.green;
    if (kind == 'payment_order_failed') return AppTheme.danger;
    if (kind == 'human_help') return Colors.blue;
    if (kind.endsWith('_100')) return AppTheme.danger;
    if (kind.endsWith('_80')) return Colors.orange;
    return AppTheme.primaryColor;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final biz = context.watch<BusinessProvider>();
    final allNotices = biz.notifications;
    final unreadCount = biz.unreadNotificationsCount;

    final displayedNotices = _selectedTab == 'unread'
        ? allNotices.where((n) => !n.isRead).toList()
        : allNotices;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loadData,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Top Header Section
            _buildTopHeader(isDark, unreadCount, biz),
            const SizedBox(height: 16),

            // Messenger Notification Portal Card
            _buildMessengerPortalCard(isDark),
            const SizedBox(height: 20),

            // Filter Tabs (All vs Unread)
            _buildFilterTabs(allNotices.length, unreadCount),
            const SizedBox(height: 14),

            // Notifications List or Empty State
            if (displayedNotices.isEmpty)
              _buildEmptyState(isDark)
            else
              ...displayedNotices.map((n) => _buildNotificationCard(isDark, n, biz)),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTopHeader(bool isDark, int unreadCount, BusinessProvider biz) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.cardDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 6, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.notifications_active_outlined, color: AppTheme.primaryColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Notifications',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      unreadCount > 0
                          ? '$unreadCount unread · orders & agent allowance'
                          : 'All quiet · orders & agent allowance',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _testingPush ? null : _runTestPush,
                  icon: _testingPush
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cell_tower_rounded, size: 16),
                  label: const Text('Test Push', style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
              if (unreadCount > 0) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final ok = await biz.markAllNotificationsRead();
                      if (ok && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('All notifications marked as read')),
                        );
                      }
                    },
                    icon: const Icon(Icons.done_all, size: 16, color: Colors.white),
                    label: const Text('Mark All Read', style: TextStyle(fontSize: 12, color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMessengerPortalCard(bool isDark) {
    final code = _messengerOverview?.code;
    final users = _messengerOverview?.users ?? [];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.cardDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 6, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.forum_rounded, color: AppTheme.primaryColor, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Messenger notifications',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Get every order and allowance notice in your Messenger too. Connect your account to receive alerts and manage the AI agent with ON/OFF commands.',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.35),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: _loadingMessenger
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.refresh, size: 20),
                onPressed: _loadingMessenger ? null : _loadMessengerOverview,
                tooltip: 'Refresh Messenger status',
              ),
            ],
          ),
          const SizedBox(height: 12),

          // PING Warning Banner
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.shade50.withValues(alpha: isDark ? 0.15 : 1),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.amber.shade300.withValues(alpha: isDark ? 0.3 : 1)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 18, color: isDark ? Colors.amber.shade200 : Colors.amber.shade900),
                const SizedBox(width: 10),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.4,
                        color: isDark ? Colors.amber.shade200 : Colors.amber.shade900,
                      ),
                      children: const [
                        TextSpan(
                          text: 'Then keep it open: send PING. ',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        TextSpan(
                          text:
                              'Facebook only lets our page message you for 7 days after the last message you sent. Ping every page you connected a business to before the deadline shown below, or alerts stop arriving.',
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Code Display or Connect Button
          if (code != null && code.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.surfaceDark : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: isDark ? AppTheme.borderDark : Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      code,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _copyCode(code),
                    icon: Icon(_copiedCode ? Icons.check : Icons.copy, size: 14),
                    label: Text(_copiedCode ? 'Copied' : 'Copy code', style: const TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Send this code in a message to our Facebook page. We will reply with a confirmation. Send ON or OFF to start/stop the AI agent. Send PING to keep alerts active for 7 days.',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.35),
            ),
            const SizedBox(height: 14),

            // Connected accounts list
            const Text(
              'CONNECTED ACCOUNTS',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.8, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            if (users.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'None yet — send the code to connect your Messenger.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              )
            else
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                ),
                child: ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: users.length,
                  separatorBuilder: (_, __) => Divider(
                    height: 1,
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                  itemBuilder: (ctx, idx) {
                    final user = users[idx];
                    final isRemoving = _removingFollowerId == user.id;

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      leading: CircleAvatar(
                        backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.1),
                        child: const Icon(Icons.person, color: AppTheme.primaryColor, size: 20),
                      ),
                      title: Text(
                        user.name ?? 'Messenger account',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Connected ${user.formattedConnectedDate}', style: const TextStyle(fontSize: 11)),
                          if (user.formattedPingDue != null)
                            Text(
                              'Ping by ${user.formattedPingDue}${user.formattedLastPing != null ? " · last ping ${user.formattedLastPing}" : ""}',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: user.isPingUrgent ? FontWeight.bold : FontWeight.normal,
                                color: user.isPingUrgent ? Colors.orange.shade800 : Colors.grey.shade600,
                              ),
                            )
                          else
                            Text(
                              'Never sent PING — send it now or alerts will stop.',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.orange.shade800),
                            ),
                        ],
                      ),
                      trailing: IconButton(
                        icon: isRemoving
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.delete_outline, color: AppTheme.danger, size: 20),
                        tooltip: 'Remove account',
                        onPressed: isRemoving ? null : () => _removeFollower(user),
                      ),
                    );
                  },
                ),
              ),
          ] else ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _creatingCode ? null : _createCode,
                icon: _creatingCode
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.add_link, color: Colors.white, size: 18),
                label: const Text('Connect my Messenger', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFilterTabs(int totalCount, int unreadCount) {
    return Row(
      children: [
        ChoiceChip(
          label: Text('All ($totalCount)'),
          selected: _selectedTab == 'all',
          onSelected: (val) {
            if (val) setState(() => _selectedTab = 'all');
          },
        ),
        const SizedBox(width: 8),
        ChoiceChip(
          label: Text('Unread ($unreadCount)'),
          selected: _selectedTab == 'unread',
          onSelected: (val) {
            if (val) setState(() => _selectedTab = 'unread');
          },
        ),
      ],
    );
  }

  Widget _buildEmptyState(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.cardDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.notifications_none_outlined, size: 36, color: AppTheme.primaryColor),
          ),
          const SizedBox(height: 14),
          const Text(
            'Nothing to read yet',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 8),
          Text(
            'A notice arrives when an order lands, plus one when an allowance passes 80% and another when it runs out — at most once per budget per cycle. Allowance notices never stop your own typing: the agent stops, the inbox does not.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationCard(bool isDark, NotificationItemModel notice, BusinessProvider biz) {
    final isUnread = !notice.isRead;
    final iconColor = _iconColorForKind(notice.kind);
    final iconData = _iconForKind(notice.kind);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isUnread
            ? (isDark ? AppTheme.primaryColor.withValues(alpha: 0.08) : const Color(0xFFF3F8FF))
            : (isDark ? AppTheme.cardDark : Colors.white),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isUnread
              ? AppTheme.primaryColor.withValues(alpha: 0.4)
              : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
          width: isUnread ? 1.5 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          if (isUnread) {
            biz.markNotificationRead(notice.id);
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header line: icon, title, tags
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: iconColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(iconData, color: iconColor, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            Text(
                              notice.displayTitle,
                              style: TextStyle(
                                fontWeight: isUnread ? FontWeight.bold : FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                            if (isUnread)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppTheme.primaryColor.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'NEW',
                                  style: TextStyle(
                                    color: AppTheme.primaryColor,
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            if (notice.period != null && notice.period!.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade200,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'cycle ${notice.period}',
                                  style: TextStyle(fontSize: 10, color: Colors.grey.shade700),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (notice.actionLabel != null)
                    OutlinedButton(
                      onPressed: () {
                        if (isUnread) biz.markNotificationRead(notice.id);
                        _handleNotificationAction(notice);
                      },
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        visualDensity: VisualDensity.compact,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text(notice.actionLabel!, style: const TextStyle(fontSize: 11)),
                    ),
                ],
              ),

              // Body content
              if (notice.body != null && notice.body!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 36),
                  child: Text(
                    notice.body!,
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      color: isDark ? Colors.grey.shade300 : Colors.grey.shade800,
                    ),
                  ),
                ),
              ],

              // Delivery Alert Warning Box
              if (notice.messenger != null && notice.messenger!.status != 'delivered') ...[
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 36),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50.withValues(alpha: isDark ? 0.15 : 1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.amber.shade200.withValues(alpha: isDark ? 0.3 : 1)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          notice.messenger!.status == 'no_recipients'
                              ? 'No Messenger alert was sent — no account is following your notification code yet.'
                              : notice.messenger!.status == 'partial'
                                  ? 'Messenger alert reached ${notice.messenger!.delivered} of ${notice.messenger!.recipients} account(s).'
                                  : 'This was not delivered to Messenger.',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? Colors.amber.shade200 : Colors.amber.shade900,
                          ),
                        ),
                        if (notice.messenger!.detail != null && notice.messenger!.detail!.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            notice.messenger!.detail!,
                            style: TextStyle(
                              fontSize: 10,
                              color: isDark ? Colors.amber.shade300 : Colors.amber.shade800,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],

              // Footer date/time
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.only(left: 36),
                child: Text(
                  notice.formattedDate,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
