import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/order.dart';
import '../../providers/business_provider.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/store_guard.dart';
import 'order_detail_screen.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final ordersProv = context.watch<OrdersProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final orders = ordersProv.orders;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        onPressed: () => openCreateOrder(context),
        icon: const Icon(Icons.add_shopping_cart, size: 20),
        label: const Text('New Order'),
      ),
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
                  onChanged: (q) => ordersProv.setSearchQuery(q),
                  decoration: InputDecoration(
                    hintText: 'Search by customer, phone, or #order...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              ordersProv.setSearchQuery('');
                            },
                          )
                        : null,
                  ),
                ),
                const SizedBox(height: 10),

                // Stage Tabs
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _tabChip('all', 'All (${ordersProv.totalOrdersCount})', ordersProv.activeTab == 'all'),
                      const SizedBox(width: 6),
                      _tabChip('pending', 'Pending (${ordersProv.pendingCount})', ordersProv.activeTab == 'pending'),
                      const SizedBox(width: 6),
                      _tabChip('acknowledged', 'Confirmed (${ordersProv.acknowledgedCount})', ordersProv.activeTab == 'acknowledged'),
                      const SizedBox(width: 6),
                      _tabChip('onDelivery', 'On Delivery (${ordersProv.onDeliveryCount})', ordersProv.activeTab == 'onDelivery'),
                      const SizedBox(width: 6),
                      _tabChip('done', 'Delivered (${ordersProv.deliveredCount})', ordersProv.activeTab == 'done'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Orders List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                if (currentStore != null) {
                  await ordersProv.fetchOrders(currentStore.id);
                }
              },
              child: ordersProv.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : orders.isEmpty
                      ? EmptyState(
                          icon: Icons.shopping_bag_outlined,
                          title: 'No Orders Found',
                          description: ordersProv.activeTab == 'all'
                              ? 'Your store has no orders yet. Create one manually or receive orders from chat!'
                              : 'No orders currently in "${OrderModel.stateTitle(ordersProv.activeTab)}" state.',
                          buttonText: 'Create Order',
                          onButtonPressed: () => openCreateOrder(context),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          itemCount: orders.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final ord = orders[index];

                            return AppCard(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => OrderDetailScreen(
                                      order: ord,
                                      businessId: currentStore?.id ?? '',
                                    ),
                                  ),
                                );
                              },
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        ord.shortOrderNumber,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 14,
                                          color: AppTheme.primaryColor,
                                        ),
                                      ),
                                      StatusBadge(status: ord.state),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Container(
                                        width: 44,
                                        height: 44,
                                        decoration: BoxDecoration(
                                          color: Colors.grey.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: const Icon(Icons.inventory_2_outlined, color: Colors.grey),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              ord.customerName,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 15,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              '${ord.count}x ${ord.productName ?? "Store items"}',
                                              style: TextStyle(
                                                fontSize: 13,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                            if (ord.customerPhone != null && ord.customerPhone!.isNotEmpty) ...[
                                              const SizedBox(height: 2),
                                              Text(
                                                ord.customerPhone!,
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.grey.shade500,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            ord.formattedTotal,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w900,
                                              fontSize: 16,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            ord.paymentMethod ?? 'COD',
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w500,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
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

  Widget _tabChip(String key, String label, bool selected) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.read<OrdersProvider>().setActiveTab(key),
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
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.bold : FontWeight.w500,
            color: selected ? Colors.white : null,
          ),
        ),
      ),
    );
  }
}
