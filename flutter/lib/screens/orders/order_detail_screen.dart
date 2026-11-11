import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/status_badge.dart';

class OrderDetailScreen extends StatefulWidget {
  final OrderModel order;
  final String businessId;

  const OrderDetailScreen({
    super.key,
    required this.order,
    required this.businessId,
  });

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late OrderModel _order;
  bool _isUpdating = false;

  @override
  void initState() {
    super.initState();
    _order = widget.order;
  }

  void _advanceState() async {
    setState(() => _isUpdating = true);
    final orders = context.read<OrdersProvider>();
    final ok = await orders.advanceOrder(widget.businessId, _order);
    if (ok && mounted) {
      final updated = orders.allOrders.firstWhere((o) => o.id == _order.id, orElse: () => _order);
      setState(() {
        _order = updated;
        _isUpdating = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order advanced to ${OrderModel.stateTitle(_order.state)}')),
      );
    } else {
      setState(() => _isUpdating = false);
    }
  }

  void _revertState() async {
    setState(() => _isUpdating = true);
    final orders = context.read<OrdersProvider>();
    final ok = await orders.revertOrder(widget.businessId, _order);
    if (ok && mounted) {
      final updated = orders.allOrders.firstWhere((o) => o.id == _order.id, orElse: () => _order);
      setState(() {
        _order = updated;
        _isUpdating = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order reverted to ${OrderModel.stateTitle(_order.state)}')),
      );
    } else {
      setState(() => _isUpdating = false);
    }
  }

  void _deleteOrder() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Order?'),
        content: const Text('Are you sure you want to delete this order? This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      final orders = context.read<OrdersProvider>();
      final ok = await orders.deleteOrder(widget.businessId, _order.id);
      if (ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Order deleted')),
        );
        Navigator.pop(context);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(orders.errorMessage ?? 'Failed to delete order'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    }
  }

  void _showEditOrderDialog() {
    final nameCtrl = TextEditingController(text: _order.customerName);
    final phoneCtrl = TextEditingController(text: _order.customerPhone ?? '');
    final addressCtrl = TextEditingController(text: _order.customerAddress ?? '');
    final countCtrl = TextEditingController(text: _order.count.toString());
    String selectedState = _order.state;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Update Order Details',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name *',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Customer Phone',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: addressCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Delivery Address',
                    prefixIcon: Icon(Icons.location_on_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: countCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Quantity / Count',
                          prefixIcon: Icon(Icons.numbers_outlined),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: selectedState,
                        decoration: const InputDecoration(labelText: 'Status'),
                        items: OrderModel.validStates.map((s) {
                          return DropdownMenuItem(
                            value: s,
                            child: Text(OrderModel.stateTitle(s)),
                          );
                        }).toList(),
                        onChanged: (v) {
                          if (v != null) {
                            setModalState(() => selectedState = v);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      final cName = nameCtrl.text.trim();
                      if (cName.isEmpty) return;
                      final count = int.tryParse(countCtrl.text.trim()) ?? _order.count;
                      final phone = phoneCtrl.text.trim();
                      final addr = addressCtrl.text.trim();

                      Navigator.pop(ctx);
                      setState(() => _isUpdating = true);

                      final orders = context.read<OrdersProvider>();
                      final updatePayload = <String, dynamic>{
                        'customerName': cName,
                        'count': count,
                        'state': selectedState,
                        if (phone.isNotEmpty) 'customerPhone': phone,
                        if (addr.isNotEmpty) 'customerAddress': addr,
                      };

                      final ok = await orders.updateOrderDetails(widget.businessId, _order.id, updatePayload);
                      if (ok && mounted) {
                        final fresh = await orders.fetchOrderDetail(widget.businessId, _order.id);
                        setState(() {
                          if (fresh != null) {
                            _order = fresh;
                          } else {
                            final fromList = orders.allOrders.firstWhere(
                              (o) => o.id == _order.id,
                              orElse: () => _order,
                            );
                            _order = fromList;
                          }
                          _isUpdating = false;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Order updated successfully!'), backgroundColor: AppTheme.success),
                        );
                      } else if (mounted) {
                        setState(() => _isUpdating = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(orders.errorMessage ?? 'Failed to update order'),
                            backgroundColor: AppTheme.danger,
                          ),
                        );
                      }
                    },
                    child: const Text('Save Order Changes'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final stages = [
      {'id': 'pending', 'label': 'Placed'},
      {'id': 'acknowledged', 'label': 'Confirmed'},
      {'id': 'onDelivery', 'label': 'Dispatched'},
      {'id': 'done', 'label': 'Delivered'},
    ];

    int currentStep = 0;
    if (_order.state == 'acknowledged') currentStep = 1;
    if (_order.state == 'onDelivery') currentStep = 2;
    if (_order.state == 'done') currentStep = 3;

    return Scaffold(
      appBar: AppBar(
        title: Text('Order ${_order.shortOrderNumber}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit Order',
            onPressed: _showEditOrderDialog,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
            tooltip: 'Delete Order',
            onPressed: _deleteOrder,
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
          border: Border(top: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)),
        ),
        child: SafeArea(
          child: Row(
            children: [
              if (_order.prevState != null) ...[
                OutlinedButton.icon(
                  onPressed: _isUpdating ? null : _revertState,
                  icon: const Icon(Icons.arrow_back, size: 16),
                  label: const Text('Revert'),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isUpdating || _order.nextState == null ? null : _advanceState,
                  icon: _isUpdating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.arrow_forward, size: 18),
                  label: Text(
                    _order.nextState != null
                        ? 'Advance to ${OrderModel.stateTitle(_order.nextState!)}'
                        : 'Order Completed',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Order Header Card
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _order.shortOrderNumber,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                    ),
                    StatusBadge(status: _order.state),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Placed on ${_order.createdAt != null ? "${_order.createdAt!.year}-${_order.createdAt!.month}-${_order.createdAt!.day}" : "Recently"}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                ),
                const SizedBox(height: 20),

                // Stepper Timeline
                Row(
                  children: List.generate(stages.length * 2 - 1, (index) {
                    if (index.isOdd) {
                      final stepIndex = index ~/ 2;
                      final isPassed = stepIndex < currentStep;
                      return Expanded(
                        child: Container(
                          height: 3,
                          color: isPassed ? AppTheme.primaryColor : Colors.grey.shade300,
                        ),
                      );
                    } else {
                      final stepIndex = index ~/ 2;
                      final isActive = stepIndex <= currentStep;
                      final isCurrent = stepIndex == currentStep;

                      return Column(
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isActive ? AppTheme.primaryColor : Colors.grey.shade300,
                              border: isCurrent ? Border.all(color: Colors.white, width: 2) : null,
                            ),
                            child: Icon(
                              isActive ? Icons.check : Icons.circle,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            stages[stepIndex]['label']!,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                              color: isActive ? AppTheme.primaryColor : Colors.grey.shade500,
                            ),
                          ),
                        ],
                      );
                    }
                  }),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Customer Details Card
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Customer & Delivery Address', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    TextButton.icon(
                      onPressed: _showEditOrderDialog,
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('Edit'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    backgroundColor: AppTheme.primaryLight,
                    child: Icon(Icons.person_outline, color: AppTheme.primaryColor),
                  ),
                  title: Text(_order.customerName, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(_order.customerPhone ?? 'No phone provided'),
                  trailing: _order.customerPhone != null
                      ? IconButton(
                          icon: const Icon(Icons.phone, color: AppTheme.primaryColor),
                          onPressed: () {
                            launchUrl(Uri.parse('tel:${_order.customerPhone}'));
                          },
                        )
                      : null,
                ),
                const Divider(),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on_outlined, size: 20, color: Colors.grey),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _order.customerAddress ?? 'No delivery address recorded.',
                        style: const TextStyle(fontSize: 13, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Line Items & Price Summary Card
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Order Items & Pricing', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: Colors.grey.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.shopping_bag_outlined, color: Colors.grey),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _order.productName ?? 'Product',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                          if (_order.variantName != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              _order.variantName!,
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                            ),
                          ],
                        ],
                      ),
                    ),
                    Text(
                      '${_order.count}x ৳${_order.unitPrice.toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  ],
                ),
                const Divider(height: 24),
                _priceRow('Subtotal', '৳${(_order.unitPrice * _order.count).toStringAsFixed(0)}'),
                const SizedBox(height: 6),
                _priceRow('Shipping Delivery Charge', '৳${_order.shippingCost.toStringAsFixed(0)}'),
                const Divider(height: 20),
                _priceRow('Total Price', _order.formattedTotal, isBold: true, fontSize: 16),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Payment Information
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Payment Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Method:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    Text(
                      _order.paymentMethod ?? 'Cash on Delivery (COD)',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
                if (_order.transactionId != null && _order.transactionId!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Transaction ID:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text(
                        _order.transactionId!,
                        style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _priceRow(String label, String value, {bool isBold = false, double fontSize = 13}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            color: isBold ? null : Colors.grey.shade600,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: isBold ? FontWeight.w900 : FontWeight.w600,
            color: isBold ? AppTheme.primaryColor : null,
          ),
        ),
      ],
    );
  }
}
