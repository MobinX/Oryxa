import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/order.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/store_guard.dart';
import 'order_detail_screen.dart';

/// The web `/orders` workspace, adapted to one scrollable column:
/// the four live KPI cards, the store catalog panel and the filterable order list.
/// The web's third column (the order drawer) is the detail screen this list opens.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _orderSearchController = TextEditingController();
  final _productSearchController = TextEditingController();

  @override
  void dispose() {
    _orderSearchController.dispose();
    _productSearchController.dispose();
    super.dispose();
  }

  Future<void> _refresh(String businessId) async {
    await context.read<OrdersProvider>().fetchOrders(businessId);
    if (!mounted) return;
    await context.read<ProductsProvider>().fetchProducts(businessId);
  }

  void _openOrder(OrderModel order) {
    final store = context.read<BusinessProvider>().currentBusiness;
    if (store == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OrderDetailScreen(
          order: order,
          businessId: store.id,
        ),
      ),
    ).then((_) {
      if (!mounted) return;
      context.read<OrdersProvider>().fetchOrders(store.id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final ordersProv = context.watch<OrdersProvider>();
    final productsProv = context.watch<ProductsProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final allOrders = ordersProv.allOrders;
    final filteredOrders = ordersProv.orders;
    final products = productsProv.products;

    final activeTab = ordersProv.activeTab;
    final tabs = <MapEntry<String, String>>[
      const MapEntry('all', 'All'),
      const MapEntry('pending', 'Pending'),
      const MapEntry('acknowledged', 'Confirmed'),
      const MapEntry('onDelivery', 'On Delivery'),
      const MapEntry('done', 'Delivered'),
    ];

    return RefreshIndicator(
      onRefresh: () async {
        if (currentStore != null) await _refresh(currentStore.id);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Orders & Products',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                        color: isDark ? Colors.white : AppTheme.textLightPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Real-time catalog and customer orders connected to your Facebook channels.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: isDark
                            ? AppTheme.textDarkSecondary
                            : AppTheme.textLightSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              ElevatedButton.icon(
                onPressed: () => openCreateOrder(context),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('New Order'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // KPI cards (the same four live counts as the web)
          Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'Total Orders',
                  value: '${ordersProv.totalOrdersCount}',
                  caption: 'Live count in database',
                  valueColor: isDark ? Colors.white : AppTheme.textLightPrimary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _KpiCard(
                  label: 'Pending Orders',
                  value: '${ordersProv.pendingCount}',
                  caption: 'Needs review or packaging',
                  valueColor: AppTheme.warning,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'In Processing / Confirmed',
                  value: '${ordersProv.processingCount}',
                  caption: 'Confirmed & packaging',
                  valueColor: AppTheme.info,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _KpiCard(
                  label: 'Delivered / Dispatched',
                  value: '${ordersProv.deliveredOrDispatchedCount}',
                  caption: 'Fulfilled orders',
                  valueColor: AppTheme.success,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (ordersProv.errorMessage != null) ...[
            _ErrorStrip(message: ordersProv.errorMessage!),
            const SizedBox(height: 12),
          ],

          // Store catalog
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text(
                      'Store Catalog',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${products.length}',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade700,
                        ),
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => openProductForm(context),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text(
                        '+ Add',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _productSearchController,
                  onChanged: productsProv.setSearchQuery,
                  decoration: const InputDecoration(
                    hintText: 'Search products or SKU...',
                    prefixIcon: Icon(Icons.search, size: 18),
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 10),
                if (productsProv.isLoading && products.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (products.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 22),
                    child: Column(
                      children: [
                        Icon(Icons.inventory_2_outlined,
                            size: 28, color: Colors.grey.shade400),
                        const SizedBox(height: 8),
                        Text(
                          productsProv.searchQuery.isEmpty
                              ? 'No products found'
                              : 'No matching products',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey,
                          ),
                        ),
                        const SizedBox(height: 4),
                        TextButton(
                          onPressed: () => openProductForm(context),
                          child: const Text(
                            'Add your first product',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  ...products.map((p) => _ProductRow(
                        product: p,
                        isDark: isDark,
                        onTap: () => openProductForm(context, product: p),
                      )),
              ],
            ),
          ),
          const SizedBox(height: 4),

          // Orders list
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text(
                      'Orders',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${allOrders.length}',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: tabs.map((tab) {
                      final selected = activeTab == tab.key;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(tab.value),
                          selected: selected,
                          onSelected: (_) => ordersProv.setActiveTab(tab.key),
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                            color: selected
                                ? Colors.white
                                : (isDark
                                    ? AppTheme.textDarkSecondary
                                    : AppTheme.textLightSecondary),
                          ),
                          selectedColor: AppTheme.primaryColor,
                          backgroundColor:
                              isDark ? AppTheme.cardDark : Colors.grey.shade100,
                          side: BorderSide.none,
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _orderSearchController,
                  onChanged: ordersProv.setSearchQuery,
                  decoration: const InputDecoration(
                    hintText: 'Search by customer, phone, or #...',
                    prefixIcon: Icon(Icons.search, size: 18),
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 10),
                if (ordersProv.isLoading && allOrders.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 28),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (filteredOrders.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      children: [
                        Icon(Icons.error_outline, size: 30, color: Colors.grey.shade400),
                        const SizedBox(height: 8),
                        Text(
                          allOrders.isEmpty ? 'No orders in database' : 'No matching orders',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          allOrders.isEmpty
                              ? 'Orders from customer Messenger chats and storefront appear here automatically.'
                              : 'Try clearing the search filter.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 11,
                            height: 1.35,
                            color: Colors.grey,
                          ),
                        ),
                        if (allOrders.isEmpty) ...[
                          const SizedBox(height: 10),
                          ElevatedButton(
                            onPressed: () => openCreateOrder(context),
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              textStyle: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                            child: const Text('+ Create First Order'),
                          ),
                        ],
                      ],
                    ),
                  )
                else
                  ...filteredOrders.map((order) => _OrderRow(
                        order: order,
                        isDark: isDark,
                        onTap: () => _openOrder(order),
                      )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final String caption;
  final Color valueColor;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.caption,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              height: 1.25,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1.1,
              color: valueColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            caption,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              height: 1.25,
              color: isDark ? Colors.grey.shade500 : Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  final ProductModel product;
  final bool isDark;
  final VoidCallback onTap;

  const _ProductRow({
    required this.product,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isDark ? AppTheme.borderDark : Colors.grey.shade100,
            ),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${product.sku ?? 'SKU'} · Stock: ${product.stock}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '৳${product.price.toStringAsFixed(0)}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderRow extends StatelessWidget {
  final OrderModel order;
  final bool isDark;
  final VoidCallback onTap;

  const _OrderRow({
    required this.order,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isDark ? AppTheme.borderDark : Colors.grey.shade100,
            ),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: order.variantImageUrl != null
                  ? CachedNetworkImage(
                      imageUrl: order.variantImageUrl!,
                      width: 38,
                      height: 38,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => _noImage(),
                    )
                  : _noImage(),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          order.shortOrderNumber,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        order.createdAtLabel,
                        style: TextStyle(
                          fontSize: 9,
                          color: Colors.grey.shade500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    order.customerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${order.productName ?? 'Item removed'}'
                    '${order.variantName != null ? ' · ${order.variantName}' : ''}'
                    '${order.count > 0 ? ' · Qty ${order.count}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? AppTheme.textDarkSecondary : Colors.grey.shade500,
                    ),
                  ),
                  if (order.customerPhone != null &&
                      order.customerPhone!.isNotEmpty)
                    Text(
                      order.customerPhone!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey.shade400,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  order.formattedTotal,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: _stateColor(order.state).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    order.stateLabelText,
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: _stateColor(order.state),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _noImage() {
    return Container(
      width: 38,
      height: 38,
      color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
      child: Icon(Icons.inventory_2_outlined, size: 16, color: Colors.grey.shade400),
    );
  }

  Color _stateColor(String state) {
    switch (state) {
      case 'pending':
        return AppTheme.warning;
      case 'done':
        return AppTheme.success;
      default:
        return AppTheme.info;
    }
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
