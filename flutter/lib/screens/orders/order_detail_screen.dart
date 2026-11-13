import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_theme.dart';
import '../../models/conversation.dart';
import '../../models/order.dart';
import '../../providers/customers_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';
import '../customers/customer_detail_screen.dart';
import '../inbox/chat_thread_screen.dart';
import '../inbox/inbox_screen.dart';
import '../products/product_form_screen.dart';

/// Mirrors the web order detail page *and* the order drawer on `/orders`: total,
/// product, customer, payment, the editable fields and every state action.
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
  final _formKey = GlobalKey<FormState>();

  late OrderModel _order;
  late TextEditingController _nameController;
  late TextEditingController _phoneController;
  late TextEditingController _addressController;
  late TextEditingController _countController;

  String _selectedState = 'pending';
  bool _isSaving = false;
  bool _isBusy = false;
  bool _loadingDetail = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _order = widget.order;
    _nameController = TextEditingController(text: _order.customerName);
    _phoneController = TextEditingController(text: _order.customerPhone ?? '');
    _addressController = TextEditingController(text: _order.customerAddress ?? '');
    _countController = TextEditingController(text: '${_order.count}');
    _selectedState = _order.state;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadDetail());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _countController.dispose();
    super.dispose();
  }

  Future<void> _loadDetail() async {
    final fresh = await context
        .read<OrdersProvider>()
        .fetchOrderDetail(widget.businessId, _order.id);
    if (!mounted) return;
    setState(() {
      _loadingDetail = false;
      if (fresh != null) _applyOrder(fresh, syncForm: true);
    });
  }

  void _applyOrder(OrderModel fresh, {bool syncForm = false}) {
    _order = fresh;
    _selectedState = fresh.state;
    if (syncForm) {
      _nameController.text = fresh.customerName;
      _phoneController.text = fresh.customerPhone ?? '';
      _addressController.text = fresh.customerAddress ?? '';
      _countController.text = '${fresh.count}';
    }
  }

  void _showError(String message) {
    setState(() => _error = message);
    appDiagnostics.recordMessage('Order ${_order.shortOrderNumber}', message);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppTheme.danger),
    );
  }

  void _showMessage(String message) {
    setState(() => _error = null);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppTheme.success),
    );
  }

  Future<void> _setState(String target) async {
    if (_isBusy) return;
    if (!_order.canTransitionTo(target)) {
      _showError(
        'Cannot move from ${_order.stateLabelText} to ${OrderModel.stateLabel(target)}',
      );
      return;
    }
    setState(() => _isBusy = true);
    final orders = context.read<OrdersProvider>();
    final ok = await orders.updateOrderState(widget.businessId, _order.id, target);
    if (!mounted) return;
    setState(() {
      _isBusy = false;
      if (ok) {
        _applyOrder(_order.copyWith(state: target));
        _selectedState = target;
        _error = null;
      }
    });
    if (ok) {
      _showMessage('Order updated to ${OrderModel.stateLabel(target)}');
    } else {
      _showError(orders.errorMessage ?? 'The order state was not changed');
    }
  }

  Future<void> _advance() async {
    final next = _order.nextState;
    if (next == null) return;
    await _setState(next);
  }

  Future<void> _revert() async {
    final prev = _order.prevState;
    if (prev == null) return;
    await _setState(prev);
  }

  Future<void> _save() async {
    appDiagnostics.recordMessage('Edit order', 'Save changes tapped');

    if (!_formKey.currentState!.validate()) {
      _showError('Check the highlighted fields before saving.');
      return;
    }

    final count = int.tryParse(_countController.text.trim());
    final trimmedName = _nameController.text.trim();
    final trimmedPhone = _phoneController.text.trim();
    final trimmedAddress = _addressController.text.trim();

    final payload = <String, dynamic>{
      // The web disables the quantity input once the order leaves `pending`, and a disabled
      // input is not submitted. Sending an unchanged count would be harmless, but sending one
      // the state no longer allows is an API error, so omit it exactly like the web does.
      if (_order.state == 'pending' && count != null && count > 0) 'count': count,
      if (trimmedName.isNotEmpty) 'customerName': trimmedName,
      // The web's update action sends `undefined` for an emptied phone or address, which keeps
      // the stored value; only a non-empty edit moves the order to another customer card.
      if (trimmedPhone.isNotEmpty) 'customerPhone': trimmedPhone,
      if (trimmedAddress.isNotEmpty) 'customerAddress': trimmedAddress,
      'state': _selectedState,
    };

    setState(() {
      _isSaving = true;
      _error = null;
    });

    final orders = context.read<OrdersProvider>();
    final ok = await orders.updateOrderDetails(
      widget.businessId,
      _order.id,
      payload,
    );
    if (!mounted) return;
    setState(() => _isSaving = false);

    if (!ok) {
      _showError(orders.errorMessage ?? 'Failed to update the order');
      return;
    }

    final fresh = await orders.fetchOrderDetail(widget.businessId, _order.id);
    if (!mounted) return;
    if (fresh != null) {
      setState(() => _applyOrder(fresh, syncForm: true));
    }
    _showMessage('Order updated');
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete order?'),
        content: Text(
          'Are you sure you want to delete ${_order.shortOrderNumber}? '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isBusy = true);
    final ok = await context.read<OrdersProvider>().deleteOrder(widget.businessId, _order.id);
    if (!mounted) return;
    setState(() => _isBusy = false);
    if (!ok) {
      _showError(context.read<OrdersProvider>().errorMessage ?? 'Order was not deleted');
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Order deleted'), backgroundColor: AppTheme.success),
    );
    Navigator.pop(context, true);
  }

  Future<void> _openProduct() async {
    final productId = _order.productId;
    if (productId == null || productId.isEmpty) return;
    final products = context.read<ProductsProvider>();
    final product = await products.fetchProductDetail(widget.businessId, productId);
    if (!mounted) return;
    if (product == null) {
      _showError('That product could not be loaded.');
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          businessId: widget.businessId,
          product: product,
        ),
      ),
    );
  }

  Future<void> _openCustomer() async {
    final customerId = _order.customerId;
    if (customerId == null || customerId.isEmpty) return;
    final customers = context.read<CustomersProvider>();
    final customer = await customers.fetchCustomerDetail(widget.businessId, customerId);
    if (!mounted) return;
    if (customer == null) {
      _showError('That customer could not be loaded.');
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CustomerDetailScreen(
          customer: customer,
          businessId: widget.businessId,
        ),
      ),
    );
  }

  Future<void> _openChat() async {
    final conversationId = _order.conversationId;
    if (conversationId == null || conversationId.isEmpty) {
      // The web's "Open Chat" links to the inbox even when the order is not tied to one
      // conversation, so land on the list rather than report that nothing can be opened.
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('Inbox')),
            body: const InboxScreen(),
          ),
        ),
      );
      if (!mounted) return;
      await _loadDetail();
      return;
    }
    final inbox = context.read<InboxProvider>();
    ConversationModel? conversation;
    for (final item in inbox.allConversations) {
      if (item.id == conversationId) {
        conversation = item;
        break;
      }
    }
    conversation ??= ConversationModel(
      id: conversationId,
      customerName: _order.customerName,
      lastMessageState: 'pending',
    );
    inbox.selectConversation(conversation);
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatThreadScreen(
          conversation: conversation!,
          businessId: widget.businessId,
        ),
      ),
    );
    if (!mounted) return;
    await _loadDetail();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final next = _order.nextState;
    final prev = _order.prevState;

    return Scaffold(
      appBar: AppBar(
        title: Text('Order ${_order.shortOrderNumber}'),
        actions: [
          if (_loadingDetail)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadDetail,
        child: Form(
          key: _formKey,
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
                          'Order ${_order.shortOrderNumber}',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        SelectableText(
                          _order.id,
                          style: TextStyle(
                            fontSize: 10,
                            fontFamily: 'monospace',
                            color: isDark
                                ? AppTheme.textDarkSecondary
                                : AppTheme.textLightSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StateChip(state: _order.state, label: _order.stateLabelText),
                ],
              ),
              const SizedBox(height: 16),

              if (_error != null) ...[
                Container(
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
                          _error!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            color: AppTheme.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Amount + item summary
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _InfoLine(
                            label: 'Total',
                            value: _order.formattedTotal,
                            bold: true,
                          ),
                        ),
                        Expanded(
                          child: _InfoLine(
                            label: 'Unit price',
                            value:
                                '${_order.formattedUnitPrice} × ${_order.count}',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: _order.variantImageUrl != null
                              ? CachedNetworkImage(
                                  imageUrl: _order.variantImageUrl!,
                                  width: 64,
                                  height: 64,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => _noImage(isDark),
                                )
                              : _noImage(isDark),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Product: ',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isDark
                                          ? AppTheme.textDarkSecondary
                                          : AppTheme.textLightSecondary,
                                    ),
                                  ),
                                  Expanded(
                                    child: _order.productId != null
                                        ? InkWell(
                                            onTap: _openProduct,
                                            child: Text(
                                              _order.productName ?? 'View product',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                                color: AppTheme.primaryColor,
                                                decoration: TextDecoration.underline,
                                              ),
                                            ),
                                          )
                                        : Text(
                                            _order.productName ?? '—',
                                            style: const TextStyle(fontSize: 12),
                                          ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Text(
                                    'Variant: ',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isDark
                                          ? AppTheme.textDarkSecondary
                                          : AppTheme.textLightSecondary,
                                    ),
                                  ),
                                  Flexible(
                                    child: Text(
                                      _order.variantName ?? '—',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  if (_order.variantShortId != null) ...[
                                    const SizedBox(width: 6),
                                    Text(
                                      '#${_order.variantShortId}',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontFamily: 'monospace',
                                        color: isDark
                                            ? AppTheme.textDarkSecondary
                                            : AppTheme.textLightSecondary,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (_order.shippingCost > 0) ...[
                      const SizedBox(height: 6),
                      _InfoLine(
                        label: 'Items (${_order.count} × ${_order.formattedUnitPrice})',
                        value: _order.formattedItemsTotal,
                      ),
                      const SizedBox(height: 6),
                      _InfoLine(label: 'Shipping', value: _order.formattedShipping),
                    ],
                    const SizedBox(height: 10),
                    _InfoLine(
                      label: 'Created',
                      value: _order.createdAt?.toLocal().toString() ?? '—',
                    ),
                    if ((_order.paymentMethod ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      _InfoLine(label: 'Payment', value: _order.paymentMethod!),
                    ],
                    if ((_order.paymentStrategy ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      _InfoLine(
                        label: 'Payment strategy',
                        value: _paymentStrategyLabel(_order.paymentStrategy),
                      ),
                    ],
                    if ((_order.transactionId ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      _InfoLine(
                        label: 'Transaction ID',
                        value: _order.transactionId!,
                        mono: true,
                      ),
                    ],
                  ],
                ),
              ),

              // Customer
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'Customer',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                        ),
                        const Spacer(),
                        if (_order.customerId != null)
                          TextButton(
                            onPressed: _openCustomer,
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(0, 28),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: const Text(
                              'View customer',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _InfoLine(label: 'Name', value: _order.customerName),
                    if ((_order.customerEmail ?? '').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _InfoLine(label: 'Email', value: _order.customerEmail!),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 100,
                          child: Text(
                            'Phone',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark
                                  ? AppTheme.textDarkSecondary
                                  : AppTheme.textLightSecondary,
                            ),
                          ),
                        ),
                        Expanded(
                          child: (_order.customerPhone ?? '').isEmpty
                              ? const Text('—', style: TextStyle(fontSize: 12))
                              : InkWell(
                                  onTap: () => launchUrl(
                                    Uri.parse('tel:${_order.customerPhone}'),
                                  ),
                                  child: Text(
                                    _order.customerPhone!,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppTheme.primaryColor,
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _InfoLine(
                      label: 'Delivery address',
                      value: (_order.customerAddress ?? '').isEmpty
                          ? '—'
                          : _order.customerAddress!,
                    ),
                  ],
                ),
              ),

              // Pipeline
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'Order Pipeline',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                        ),
                        const Spacer(),
                        Text(
                          'Tap any step to set',
                          style: TextStyle(
                            fontSize: 10,
                            color: isDark
                                ? AppTheme.textDarkSecondary
                                : Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._timelineSteps(),
                    const SizedBox(height: 14),
                    Text(
                      'QUICK STATE JUMP (FORWARD / BACKWARD)',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: isDark
                            ? AppTheme.textDarkSecondary
                            : Colors.grey.shade500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 6,
                      crossAxisSpacing: 6,
                      childAspectRatio: 3.4,
                      children: OrderModel.states.map((state) {
                        final selected = _order.state == state;
                        final allowed = _order.canTransitionTo(state);
                        return OutlinedButton(
                          onPressed: (_isBusy || selected || !allowed)
                              ? null
                              : () => _setState(state),
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            backgroundColor: selected
                                ? AppTheme.primaryColor
                                : (isDark ? AppTheme.cardDark : Colors.grey.shade50),
                            side: BorderSide(
                              color: selected
                                  ? AppTheme.primaryColor
                                  : (isDark
                                      ? AppTheme.borderDark
                                      : AppTheme.borderLight),
                            ),
                            foregroundColor: selected
                                ? Colors.white
                                : (isDark ? Colors.white70 : Colors.black87),
                            textStyle: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          child: Text(OrderModel.stateLabel(state)),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: prev == null
                              ? Container(
                                  height: 42,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: isDark
                                          ? AppTheme.borderDark
                                          : AppTheme.borderLight,
                                    ),
                                  ),
                                  child: Text(
                                    'Initial Stage',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500,
                                    ),
                                  ),
                                )
                              : OutlinedButton.icon(
                                  onPressed: _isBusy ? null : _revert,
                                  icon: const Icon(Icons.undo, size: 16),
                                  label: Text('Revert to ${OrderModel.stateLabel(prev)}'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppTheme.warning,
                                    side: BorderSide(
                                      color: AppTheme.warning.withValues(alpha: 0.5),
                                    ),
                                    padding: const EdgeInsets.symmetric(vertical: 11),
                                    textStyle: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: next == null
                              ? Container(
                                  height: 42,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    color: AppTheme.successBg,
                                    border: Border.all(
                                      color: AppTheme.success.withValues(alpha: 0.3),
                                    ),
                                  ),
                                  child: const Text(
                                    'Order Fulfilled',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: AppTheme.success,
                                    ),
                                  ),
                                )
                              : ElevatedButton.icon(
                                  onPressed: _isBusy ? null : _advance,
                                  icon: const Icon(Icons.check_circle_outline, size: 16),
                                  label: Text(
                                    'Advance to ${OrderModel.stateLabel(next)}',
                                  ),
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 11),
                                    textStyle: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Actions
              AppCard(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _openChat,
                            icon: const Icon(Icons.chat_bubble_outline, size: 16),
                            label: const Text('Open Chat'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              textStyle: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _isBusy ? null : _delete,
                            icon: const Icon(Icons.delete_outline, size: 16),
                            label: const Text('Delete'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.danger,
                              side: BorderSide(
                                color: AppTheme.danger.withValues(alpha: 0.35),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              textStyle: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Edit form
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Edit order',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _countController,
                            enabled: _order.state == 'pending',
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(
                              labelText: 'Quantity',
                              helperText: _order.state == 'pending'
                                  ? null
                                  : 'Quantity can only be changed while the order is pending.',
                              helperMaxLines: 2,
                            ),
                            validator: (value) {
                              if (_order.state != 'pending') return null;
                              final n = int.tryParse((value ?? '').trim());
                              if (n == null || n <= 0) return 'Enter a quantity of at least 1';
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: _selectedState,
                            isExpanded: true,
                            decoration: const InputDecoration(labelText: 'State'),
                            items: OrderModel.states
                                .map((state) => DropdownMenuItem(
                                      value: state,
                                      child: Text(OrderModel.stateLabel(state)),
                                    ))
                                .toList(),
                            onChanged: (value) {
                              if (value == null) return;
                              setState(() => _selectedState = value);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _nameController,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Customer name'),
                      validator: (value) => (value ?? '').trim().isEmpty
                          ? 'Enter the customer name'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'Phone'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _addressController,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Address'),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _isSaving ? null : () => Navigator.pop(context),
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _isSaving ? null : _save,
                            child: _isSaving
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('Save changes'),
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
      ),
    );
  }

  List<Widget> _timelineSteps() {
    final currentIndex = OrderModel.states.indexOf(_order.state);
    final steps = <Map<String, String>>[
      {
        'id': 'pending',
        'title': 'Order Placed',
        'desc': '${_order.customerName} (${_order.createdAtLabel})',
      },
      {
        'id': 'acknowledged',
        'title': 'Order Confirmed',
        'desc': _order.state != 'pending'
            ? 'Confirmed by merchant / AI agent'
            : 'Awaiting merchant confirmation',
      },
      {
        'id': 'onDelivery',
        'title': 'Handed to Courier',
        'desc': (_order.state == 'onDelivery' || _order.state == 'done')
            ? 'Dispatched for delivery'
            : 'Pending dispatch',
      },
      {
        'id': 'done',
        'title': 'Delivered & Completed',
        'desc': _order.state == 'done'
            ? 'Customer received parcel'
            : 'In transit / pending',
      },
    ];

    return steps.asMap().entries.map((entry) {
      final idx = entry.key;
      final step = entry.value;
      final state = step['id']!;
      final isCurrent = _order.state == state;
      final isPassed = idx <= currentIndex;
      final allowed = _order.canTransitionTo(state);
      final isDark = Theme.of(context).brightness == Brightness.dark;

      return InkWell(
        onTap: (_isBusy || isCurrent || !allowed) ? null : () => _setState(state),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: isCurrent
                ? AppTheme.primaryColor.withValues(alpha: 0.1)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: isCurrent
                ? Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.35))
                : null,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCurrent
                      ? AppTheme.primaryColor
                      : (isPassed ? AppTheme.success : Colors.transparent),
                  border: Border.all(
                    color: isCurrent
                        ? AppTheme.primaryColor
                        : (isPassed
                            ? AppTheme.success
                            : (isDark
                                ? Colors.grey.shade700
                                : Colors.grey.shade300)),
                    width: 2,
                  ),
                ),
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
                            step['title']!,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight:
                                  isCurrent ? FontWeight.w800 : FontWeight.w600,
                              color: isCurrent
                                  ? AppTheme.primaryColor
                                  : (isPassed
                                      ? null
                                      : (isDark
                                          ? AppTheme.textDarkSecondary
                                          : Colors.grey.shade500)),
                            ),
                          ),
                        ),
                        if (isCurrent)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'CURRENT',
                              style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                                color: AppTheme.primaryColor,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 1),
                    Text(
                      step['desc']!,
                      style: TextStyle(
                        fontSize: 10,
                        color: isDark
                            ? AppTheme.textDarkSecondary
                            : Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }).toList();
  }

  Widget _noImage(bool isDark) {
    return Container(
      width: 64,
      height: 64,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: Text(
        'No img',
        style: TextStyle(fontSize: 9, color: Colors.grey.shade500),
      ),
    );
  }

  String _paymentStrategyLabel(String? value) {
    switch (value) {
      case 'delivery_prepaid':
        return 'Delivery charge prepaid';
      case 'full_prepaid':
        return 'Full payment prepaid';
      default:
        return 'Cash on delivery';
    }
  }
}

class _StateChip extends StatelessWidget {
  final String state;
  final String label;

  const _StateChip({required this.state, required this.label});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (state) {
      case 'pending':
        color = AppTheme.warning;
        break;
      case 'done':
        color = AppTheme.success;
        break;
      default:
        color = AppTheme.info;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final bool mono;

  const _InfoLine({
    required this.label,
    required this.value,
    this.bold = false,
    this.mono = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 12,
              height: 1.35,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              fontFamily: mono ? 'monospace' : null,
            ),
          ),
        ),
      ],
    );
  }
}
