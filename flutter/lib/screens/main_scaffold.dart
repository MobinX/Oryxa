import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../config/app_version.dart';
import '../providers/auth_provider.dart';
import '../providers/business_provider.dart';
import '../providers/inbox_provider.dart';
import '../providers/orders_provider.dart';
import '../providers/products_provider.dart';
import 'analytics/analytics_screen.dart';
import 'business/business_picker_screen.dart';
import 'channels/channels_screen.dart';
import 'customers/customers_screen.dart';
import 'dashboard/dashboard_screen.dart';
import 'diagnostics/diagnostics_screen.dart';
import 'inbox/inbox_screen.dart';
import 'notifications/notifications_screen.dart';
import 'orders/orders_screen.dart';
import 'payments/payments_screen.dart';
import 'playground/playground_screen.dart';
import 'products/categories_screen.dart';
import 'products/products_screen.dart';
import 'settings/ota_update_screen.dart';
import 'settings/settings_screen.dart';
import 'storefront/storefront_screen.dart';

class MainScaffold extends StatefulWidget {
  const MainScaffold({super.key});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  void _loadData() {
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    final biz = context.read<BusinessProvider>();
    biz.fetchBusinesses(preferredBusinessId: auth.selectedBusinessId).then((_) {
      if (!mounted) return;
      if (biz.currentBusiness != null) {
        final bId = biz.currentBusiness!.id;
        context.read<InboxProvider>().fetchConversations(bId);
        context.read<OrdersProvider>().fetchOrders(bId);
        context.read<ProductsProvider>().fetchProducts(bId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final ordersProv = context.watch<OrdersProvider>();
    final productsProv = context.watch<ProductsProvider>();
    final currentStore = biz.currentBusiness;

    // Surface background failures from any core provider, not just the store
    // request: a failed product/order load was previously invisible.
    final stripError = biz.errorMessage ??
        (ordersProv.errorMessage != null
            ? 'Orders: ${ordersProv.errorMessage}'
            : null) ??
        (productsProv.errorMessage != null
            ? 'Products: ${productsProv.errorMessage}'
            : null);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const BusinessPickerScreen()),
            ).then((_) => _loadData());
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.store_mall_directory_outlined,
                    size: 18,
                    color: AppTheme.primaryColor,
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      currentStore?.name ?? 'OnlyOrders',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Row(
                      children: [
                        Text(
                          'Switch store',
                          style: TextStyle(
                            fontSize: 10,
                            color: Colors.grey.shade500,
                          ),
                        ),
                        const Icon(Icons.arrow_drop_down, size: 14, color: Colors.grey),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        actions: [
          // OTA Patch Status button
          IconButton(
            icon: const Icon(Icons.system_update_alt, size: 20),
            tooltip: 'OTA Remote Patches',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const OtaUpdateScreen()),
              );
            },
          ),
          // Notifications button with badge
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                tooltip: 'Notifications',
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                  );
                },
              ),
              if (biz.unreadNotificationsCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AppTheme.danger,
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text(
                      '${biz.unreadNotificationsCount}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      drawer: _buildDrawer(context),
      body: Column(
        children: [
          if (stripError != null && currentStore != null)
            _ErrorStrip(
              message: stripError,
              onRetry: _loadData,
              onDetails: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DiagnosticsScreen()),
                );
              },
            ),
          Expanded(child: _buildBody(biz)),
        ],
      ),
      bottomNavigationBar: currentStore == null
          ? null
          : NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Inbox',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Catalog',
          ),
          NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'More',
          ),
        ],
      ),
    );
  }

  /// A signed-in merchant with no loaded store cannot create anything, so say why instead of
  /// rendering tabs whose create buttons would silently do nothing.
  Widget _buildBody(BusinessProvider biz) {
    if (biz.currentBusiness != null) {
      return IndexedStack(
        index: _currentIndex,
        children: [
          const DashboardScreen(),
          const InboxScreen(),
          const OrdersScreen(),
          const ProductsScreen(),
          _buildMoreMenu(context),
        ],
      );
    }

    if (biz.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final error = biz.errorMessage;
    final hasError = error != null && error.isNotEmpty;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                hasError ? Icons.cloud_off_outlined : Icons.storefront_outlined,
                size: 56,
                color: hasError ? AppTheme.danger : AppTheme.primaryColor,
              ),
              const SizedBox(height: 16),
              Text(
                hasError ? 'Could not load your store' : 'No store yet',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                hasError
                    ? error
                    : 'Create your first business store to start managing products and orders.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.4),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _loadData,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(hasError ? 'Retry' : 'Reload'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const BusinessPickerScreen()),
                  ).then((_) => _loadData());
                },
                child: const Text('Choose or create a store'),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const DiagnosticsScreen()),
                  );
                },
                icon: const Icon(Icons.bug_report_outlined, size: 18),
                label: const Text('Diagnostics & error log'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDrawer(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final biz = context.watch<BusinessProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            // OnlyOrders Brand Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Image.asset(
                  isDark ? 'assets/onlyorders-logo-dark.png' : 'assets/onlyorders-logo.png',
                  height: 28,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => Image.asset(
                    'assets/logo.png',
                    height: 28,
                  ),
                ),
              ),
            ),
            const Divider(height: 1),

            // User / Business Info Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: AppTheme.primaryColor,
                    child: Text(
                      (auth.user?.name ?? 'M').substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          auth.user?.name ?? 'Store Owner',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          biz.currentBusiness?.name ?? 'Merchant Portal',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Navigation items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _drawerItem(
                    icon: Icons.dashboard_outlined,
                    title: 'Dashboard',
                    onTap: () {
                      Navigator.pop(context);
                      setState(() => _currentIndex = 0);
                    },
                  ),
                  _drawerItem(
                    icon: Icons.chat_bubble_outline,
                    title: 'Omnichannel Inbox',
                    onTap: () {
                      Navigator.pop(context);
                      setState(() => _currentIndex = 1);
                    },
                  ),
                  _drawerItem(
                    icon: Icons.assignment_outlined,
                    title: 'Orders Management',
                    onTap: () {
                      Navigator.pop(context);
                      setState(() => _currentIndex = 2);
                    },
                  ),
                  _drawerItem(
                    icon: Icons.inventory_2_outlined,
                    title: 'Products Catalog',
                    onTap: () {
                      Navigator.pop(context);
                      setState(() => _currentIndex = 3);
                    },
                  ),
                  _drawerItem(
                    icon: Icons.category_outlined,
                    title: 'Categories',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const CategoriesScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.people_outline,
                    title: 'Customers CRM',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomersScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.hub_outlined,
                    title: 'Channels & Integrations',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const ChannelsScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.smart_toy_outlined,
                    title: 'AI Agent Playground',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const PlaygroundScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.storefront_outlined,
                    title: 'Storefront',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const StorefrontScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.bar_chart_outlined,
                    title: 'Analytics',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.payments_outlined,
                    title: 'Payments & Delivery',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const PaymentsScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.settings_outlined,
                    title: 'Store Settings',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
                    },
                  ),
                  _drawerItem(
                    icon: Icons.system_update_alt,
                    title: 'OTA Remote Patches',
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const OtaUpdateScreen()));
                    },
                  ),
                ],
              ),
            ),

            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.danger),
              title: const Text('Log Out', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.pop(context);
                auth.logout();
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, size: 22),
      title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      dense: true,
      onTap: onTap,
    );
  }

  Widget _buildMoreMenu(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Store Management & Tools',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        _menuCard(
          context,
          icon: Icons.people_outline,
          title: 'Customers CRM',
          subtitle: 'Manage client directory, notes & history',
          color: Colors.blue,
          screen: const CustomersScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.category_outlined,
          title: 'Product Categories',
          subtitle: 'Organize your store catalog taxonomy',
          color: Colors.teal,
          screen: const CategoriesScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.hub_outlined,
          title: 'Channels & Integrations',
          subtitle: 'Facebook Page, Messenger & WhatsApp',
          color: const Color(0xFF1877F2),
          screen: const ChannelsScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.smart_toy_outlined,
          title: 'AI Agent Playground',
          subtitle: 'Test live auto-reply responses & tools',
          color: Colors.purple,
          screen: const PlaygroundScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.storefront_outlined,
          title: 'Public Storefront',
          subtitle: 'Customize theme & preview public catalog',
          color: Colors.indigo,
          screen: const StorefrontScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.bar_chart_outlined,
          title: 'Sales & AI Analytics',
          subtitle: 'Revenue, orders & conversation resolution',
          color: Colors.amber.shade800,
          screen: const AnalyticsScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.payments_outlined,
          title: 'Payments & Delivery Zones',
          subtitle: 'COD, bKash, delivery fees & payment rules',
          color: Colors.green,
          screen: const PaymentsScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.settings_outlined,
          title: 'Store & AI Settings',
          subtitle: 'Business info, AI personality & prompts',
          color: Colors.blueGrey,
          screen: const SettingsScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.system_update_alt,
          title: 'Cloudflare OTA Patches',
          subtitle: 'Hotfixes & over-the-air updates',
          color: AppTheme.primaryColor,
          screen: const OtaUpdateScreen(),
        ),
        _menuCard(
          context,
          icon: Icons.bug_report_outlined,
          title: 'Diagnostics & Error Log',
          subtitle: 'Patch status, API tests & recorded failures',
          color: AppTheme.danger,
          screen: const DiagnosticsScreen(),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            'OnlyOrders $appVersionLabel',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _menuCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required Widget screen,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        subtitle: Text(subtitle, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
        trailing: const Icon(Icons.chevron_right, size: 20),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => screen)),
      ),
    );
  }
}

/// A persistent, tappable strip: a transient snackbar is exactly what merchants
/// miss when a request fails in the background.
class _ErrorStrip extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  final VoidCallback onDetails;

  const _ErrorStrip({
    required this.message,
    required this.onRetry,
    required this.onDetails,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: isDark ? const Color(0xFF3A1A1A) : AppTheme.dangerBg,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(
          children: [
            const Icon(Icons.cloud_off_outlined, size: 18, color: AppTheme.danger),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, height: 1.3),
              ),
            ),
            TextButton(
              onPressed: onDetails,
              child: const Text('Details'),
            ),
            IconButton(
              tooltip: 'Retry',
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
            ),
          ],
        ),
      ),
    );
  }
}
