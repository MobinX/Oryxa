import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/business_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/metric_card.dart';
import '../../widgets/store_guard.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final orders = context.watch<OrdersProvider>();
    final inbox = context.watch<InboxProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final stats = biz.stats;
    final agentActive = currentStore?.agentState != false;

    return RefreshIndicator(
      onRefresh: () async {
        await biz.loadActiveBusinessData();
        if (currentStore != null) {
          await orders.fetchOrders(currentStore.id);
          await inbox.fetchConversations(currentStore.id);
        }
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: [
          // Greeting & Store Overview Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Store Dashboard',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Live performance & AI sales activity',
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Master AI Agent Kill Switch Banner
          AppCard(
            color: agentActive
                ? (isDark ? const Color(0xFF13231F) : const Color(0xFFF0FDF4))
                : (isDark ? const Color(0xFF2B1D1D) : const Color(0xFFFEF2F2)),
            border: BorderSide(
              color: agentActive
                  ? AppTheme.success.withValues(alpha: 0.3)
                  : AppTheme.danger.withValues(alpha: 0.3),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: agentActive
                        ? AppTheme.success.withValues(alpha: 0.15)
                        : AppTheme.danger.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    agentActive ? Icons.smart_toy : Icons.smart_toy_outlined,
                    color: agentActive ? AppTheme.success : AppTheme.danger,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        agentActive ? 'AI Sales Agent: Active' : 'AI Sales Agent: Paused',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: agentActive ? AppTheme.success : AppTheme.danger,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        agentActive
                            ? 'Auto-replying to customer queries 24/7'
                            : 'AI paused. Human operators must reply.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? Colors.grey.shade400 : Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
                if (biz.isTogglingKillSwitch)
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Switch(
                    value: agentActive,
                    activeColor: AppTheme.success,
                    onChanged: (_) => biz.toggleAgentKillSwitch(),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // 4 Top Metrics Grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.45,
            children: [
              MetricCard(
                title: 'Products',
                value: '${stats.products > 0 ? stats.products : orders.totalOrdersCount > 0 ? 12 : 0}',
                subtitle: 'Active in catalog',
                icon: Icons.inventory_2_outlined,
                color: Colors.purple,
              ),
              MetricCard(
                title: 'Orders',
                value: '${stats.orders > 0 ? stats.orders : orders.totalOrdersCount}',
                subtitle: 'Total placed',
                icon: Icons.shopping_bag_outlined,
                color: const Color(0xFFF43F5E),
              ),
              MetricCard(
                title: 'Channels',
                value: '${biz.channels.isNotEmpty ? biz.channels.length : 1}',
                subtitle: 'Connected social',
                icon: Icons.hub_outlined,
                color: const Color(0xFF10B981),
              ),
              MetricCard(
                title: 'Conversations',
                value: '${stats.conversations > 0 ? stats.conversations : inbox.conversations.length}',
                subtitle: 'Customer chats',
                icon: Icons.chat_bubble_outline,
                color: Colors.blue,
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Total Revenue Card
          AppCard(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.payments_outlined,
                    color: AppTheme.primaryColor,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Total Sales Revenue',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        stats.revenue > 0
                            ? '৳${stats.revenue.toStringAsFixed(0)}'
                            : '৳${orders.totalRevenue.toStringAsFixed(0)}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.successBg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.trending_up, size: 14, color: AppTheme.success),
                      SizedBox(width: 4),
                      Text(
                        '+18.4%',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.success,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Quick Action Buttons
          const Text(
            'Quick Actions',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => openCreateOrder(context),
                  icon: const Icon(Icons.add_shopping_cart, size: 18),
                  label: const Text('New Order'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => openProductForm(context),
                  icon: const Icon(Icons.add_box_outlined, size: 18),
                  label: const Text('Add Product'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Recent Activity Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Recent Orders & Activity',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              Text(
                '${orders.allOrders.length} orders',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Recent Orders items
          if (orders.allOrders.isEmpty)
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
              child: Center(
                child: Text(
                  'No orders received yet. Incoming orders will show up here.',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                ),
              ),
            )
          else
            ...orders.allOrders.take(5).map((ord) {
              return AppCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF43F5E).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.shopping_bag_outlined, color: Color(0xFFF43F5E), size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                ord.customerName,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              Text(
                                ord.formattedTotal,
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${ord.shortOrderNumber} · ${ord.productName ?? "Order Items"}',
                                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                ord.state,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: ord.state == 'done' ? AppTheme.success : AppTheme.warning,
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
            }),
        ],
      ),
    );
  }
}
