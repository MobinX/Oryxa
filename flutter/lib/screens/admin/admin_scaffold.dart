import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../providers/admin_provider.dart';
import '../auth/login_screen.dart';
import '../main_scaffold.dart';
import 'channels/admin_channels_screen.dart';
import 'dashboard/admin_dashboard_screen.dart';
import 'generic/admin_generic_panel_screen.dart';
import 'logs/admin_logs_screen.dart';
import 'mail/admin_mailbox_screen.dart';
import 'plans/admin_plans_screen.dart';
import 'settings/admin_settings_screen.dart';
import 'tokens/admin_tokens_screen.dart';

class _NavItem {
  final String key;
  final String label;
  final IconData icon;
  final String capability;
  final Widget Function() builder;

  const _NavItem({
    required this.key,
    required this.label,
    required this.icon,
    required this.capability,
    required this.builder,
  });
}

class _NavGroup {
  final String label;
  final List<_NavItem> items;

  const _NavGroup({required this.label, required this.items});
}

class AdminScaffold extends StatefulWidget {
  const AdminScaffold({super.key});

  @override
  State<AdminScaffold> createState() => _AdminScaffoldState();
}

class _AdminScaffoldState extends State<AdminScaffold> {
  String _selectedKey = 'dashboard';

  final List<_NavGroup> _allGroups = [
    _NavGroup(
      label: 'Overview',
      items: [
        _NavItem(
          key: 'dashboard',
          label: 'Dashboard',
          icon: Icons.dashboard_outlined,
          capability: 'dashboard',
          builder: () => const AdminDashboardScreen(),
        ),
        _NavItem(
          key: 'tokens',
          label: 'Tokens',
          icon: Icons.memory_outlined,
          capability: 'tokens',
          builder: () => const AdminTokensScreen(),
        ),
        _NavItem(
          key: 'model_billing',
          label: 'Model billing',
          icon: Icons.receipt_long_outlined,
          capability: 'model_billing',
          builder: () => const AdminGenericPanelScreen(
            title: 'Model Billing',
            description: 'AI model cost accounting, token usage meters, and billing invoices.',
            icon: Icons.receipt_long_outlined,
          ),
        ),
      ],
    ),
    _NavGroup(
      label: 'Mail',
      items: [
        _NavItem(
          key: 'inbox',
          label: 'Mailbox',
          icon: Icons.mail_outline,
          capability: 'inbox',
          builder: () => const AdminMailboxScreen(),
        ),
      ],
    ),
    _NavGroup(
      label: 'Store platform',
      items: [
        _NavItem(
          key: 'plans',
          label: 'Plans',
          icon: Icons.credit_card_outlined,
          capability: 'plans',
          builder: () => const AdminPlansScreen(),
        ),
        _NavItem(
          key: 'channels',
          label: 'Store channels',
          icon: Icons.radio_outlined,
          capability: 'channels',
          builder: () => const AdminChannelsScreen(),
        ),
        _NavItem(
          key: 'default_agent',
          label: 'Default agent',
          icon: Icons.description_outlined,
          capability: 'default_agent',
          builder: () => const AdminGenericPanelScreen(
            title: 'Default Agent Guidance',
            description: 'Global system prompts, fallback sales scripts, and guidance overrides.',
            icon: Icons.description_outlined,
          ),
        ),
        _NavItem(
          key: 'playground',
          label: 'Playground',
          icon: Icons.smart_toy_outlined,
          capability: 'playground',
          builder: () => const AdminGenericPanelScreen(
            title: 'Operator Playground',
            description: 'Simulate and test customer-facing sales conversations in sandbox mode.',
            icon: Icons.smart_toy_outlined,
          ),
        ),
      ],
    ),
    _NavGroup(
      label: 'Official channels',
      items: [
        _NavItem(
          key: 'official_channels',
          label: 'Official channels',
          icon: Icons.public_outlined,
          capability: 'official_channels',
          builder: () => const AdminGenericPanelScreen(
            title: 'Official Platform Channels',
            description: 'OnlyOrders official brand pages and central public communications.',
            icon: Icons.public_outlined,
          ),
        ),
        _NavItem(
          key: 'official_inbox',
          label: 'Official inbox',
          icon: Icons.inbox_outlined,
          capability: 'official_inbox',
          builder: () => const AdminGenericPanelScreen(
            title: 'Official Inbox',
            description: 'Support requests and conversations directed to official company channels.',
            icon: Icons.inbox_outlined,
          ),
        ),
        _NavItem(
          key: 'tickets',
          label: 'Tickets',
          icon: Icons.support_agent_outlined,
          capability: 'tickets',
          builder: () => const AdminGenericPanelScreen(
            title: 'Support Tickets',
            description: 'Merchant escalation tickets and technical helpdesk cases.',
            icon: Icons.support_agent_outlined,
          ),
        ),
        _NavItem(
          key: 'prospects',
          label: 'Prospects',
          icon: Icons.people_outline,
          capability: 'prospects',
          builder: () => const AdminGenericPanelScreen(
            title: 'Merchant Prospects',
            description: 'Onboarding leads, inbound merchant inquiries, and CRM pipeline.',
            icon: Icons.people_outline,
          ),
        ),
      ],
    ),
    _NavGroup(
      label: 'System',
      items: [
        _NavItem(
          key: 'logs',
          label: 'Event log',
          icon: Icons.receipt_outlined,
          capability: 'logs',
          builder: () => const AdminLogsScreen(),
        ),
        _NavItem(
          key: 'settings',
          label: 'Settings',
          icon: Icons.settings_outlined,
          capability: 'settings',
          builder: () => const AdminSettingsScreen(),
        ),
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final admin = context.watch<AdminProvider>();
    final user = admin.adminUser;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Filter groups and items according to adminUser capabilities
    final visibleGroups = _allGroups
        .map((group) {
          final visibleItems = group.items.where((item) => admin.can(item.capability)).toList();
          return _NavGroup(label: group.label, items: visibleItems);
        })
        .where((group) => group.items.isNotEmpty)
        .toList();

    final allVisibleItems = visibleGroups.expand((g) => g.items).toList();

    // If current selected key is not permitted, select first permitted item
    if (allVisibleItems.isNotEmpty && !allVisibleItems.any((i) => i.key == _selectedKey)) {
      _selectedKey = allVisibleItems.first.key;
    }

    final currentItem = allVisibleItems.firstWhere(
      (i) => i.key == _selectedKey,
      orElse: () => _NavItem(
        key: 'forbidden',
        label: 'Access Restricted',
        icon: Icons.lock_outline,
        capability: '',
        builder: () => const Center(child: Text('You do not have access to this section.')),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: const Color(0xFF141234),
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.all(4),
              child: Image.asset(
                'assets/onlyorders-mark.png',
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(Icons.shield, size: 18, color: Colors.white),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              currentItem.label,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
          ],
        ),
        actions: [
          // Switch to Merchant Shortcut Button
          TextButton.icon(
            onPressed: () async {
              await admin.switchToMerchant();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const MainScaffold()),
                  (route) => false,
                );
              }
            },
            icon: const Icon(Icons.storefront_outlined, size: 16),
            label: const Text('Merchant', style: TextStyle(fontSize: 12)),
          ),
          const SizedBox(width: 4),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              // Drawer Header with Admin Identity
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF191A29) : const Color(0xFFF6F8FC),
                  border: Border(
                    bottom: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFF141234),
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.primaryColor.withValues(alpha: 0.3),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(7),
                      child: Image.asset(
                        'assets/onlyorders-mark.png',
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(Icons.shield, color: Colors.white),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  user?.name ?? 'Console Admin',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration: BoxDecoration(
                                  color: (user?.isSuperuser == true ? Colors.purple : AppTheme.primaryColor)
                                      .withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  (user?.role ?? 'admin').toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: user?.isSuperuser == true ? Colors.purple : AppTheme.primaryColor,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.email ?? '',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Filtered Navigation Groups
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: visibleGroups.length,
                  itemBuilder: (context, gIndex) {
                    final group = visibleGroups[gIndex];
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: Text(
                            group.label.toUpperCase(),
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                            ),
                          ),
                        ),
                        ...group.items.map((item) {
                          final isSelected = item.key == _selectedKey;
                          return ListTile(
                            dense: true,
                            leading: Icon(
                              item.icon,
                              size: 20,
                              color: isSelected ? AppTheme.primaryColor : null,
                            ),
                            title: Text(
                              item.label,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                color: isSelected ? AppTheme.primaryColor : null,
                              ),
                            ),
                            selected: isSelected,
                            selectedTileColor: AppTheme.primaryColor.withValues(alpha: 0.1),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                            onTap: () {
                              setState(() => _selectedKey = item.key);
                              Navigator.of(context).pop();
                            },
                          );
                        }),
                      ],
                    );
                  },
                ),
              ),

              // Bottom Logout & Switch Section
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.storefront_outlined, size: 20),
                      title: const Text('Switch to Merchant Panel', style: TextStyle(fontSize: 13)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      onTap: () async {
                        Navigator.of(context).pop();
                        await admin.switchToMerchant();
                        if (context.mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const MainScaffold()),
                            (route) => false,
                          );
                        }
                      },
                    ),
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.logout, size: 20, color: AppTheme.danger),
                      title: const Text(
                        'Sign Out',
                        style: TextStyle(fontSize: 13, color: AppTheme.danger, fontWeight: FontWeight.bold),
                      ),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      onTap: () async {
                        Navigator.of(context).pop();
                        await admin.adminLogout();
                        if (context.mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const LoginScreen()),
                            (route) => false,
                          );
                        }
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: currentItem.builder(),
    );
  }
}
