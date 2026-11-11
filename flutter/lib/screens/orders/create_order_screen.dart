import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/business.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../widgets/app_card.dart';

/// Mirrors `apps/web/lib/payment-strategy.ts`: a product's own rule wins over the store
/// default, and an unknown value is treated as cash on delivery rather than as an error.
String _resolveStrategy(String? storeDefault, String? productOverride) {
  if (productOverride == 'cod' ||
      productOverride == 'delivery_prepaid' ||
      productOverride == 'full_prepaid') {
    return productOverride!;
  }
  if (storeDefault == 'delivery_prepaid' || storeDefault == 'full_prepaid') {
    return storeDefault!;
  }
  return 'cod';
}

String _strategyLabel(String strategy) {
  switch (strategy) {
    case 'delivery_prepaid':
      return 'Delivery charge prepaid';
    case 'full_prepaid':
      return 'Full prepayment';
    default:
      return 'Cash on delivery';
  }
}

class CreateOrderScreen extends StatefulWidget {
  final String businessId;
  final String? initialCustomerName;

  const CreateOrderScreen({
    super.key,
    required this.businessId,
    this.initialCustomerName,
  });

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _quantityController = TextEditingController(text: '1');
  final _shippingCostController = TextEditingController();
  final _txIdController = TextEditingController();

  String _paymentMethod = 'Cash on delivery';
  String? _selectedZoneValue;
  ProductModel? _selectedProduct;
  List<ProductVariantModel> _variants = const [];
  ProductVariantModel? _selectedVariant;
  bool _isLoadingDetail = false;
  String? _detailError;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialCustomerName != null) {
      _nameController.text = widget.initialCustomerName!;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final prods = context.read<ProductsProvider>();
      if (prods.products.isEmpty) {
        prods.fetchProducts(widget.businessId);
      }
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _quantityController.dispose();
    _shippingCostController.dispose();
    _txIdController.dispose();
    super.dispose();
  }

  BusinessModel? get _business => context.read<BusinessProvider>().currentBusiness;

  String get _strategy =>
      _resolveStrategy(_business?.paymentStrategy, _selectedProduct?.paymentStrategyOverride);

  bool get _isOverride {
    final override = _selectedProduct?.paymentStrategyOverride;
    return override != null &&
        (override == 'cod' || override == 'delivery_prepaid' || override == 'full_prepaid') &&
        override != (_business?.paymentStrategy ?? 'cod');
  }

  double get _shippingCost => double.tryParse(_shippingCostController.text.trim()) ?? 0;

  /// Same rule as the API's `checkOrderPayment`: delivery prepay only demands money when
  /// there is a delivery charge to collect.
  bool get _needsUpfront =>
      _strategy == 'full_prepaid' || (_strategy == 'delivery_prepaid' && _shippingCost > 0);

  PaymentMethodModel? get _selectedPaymentMethod {
    final methods = _business?.paymentMethods ?? const <PaymentMethodModel>[];
    for (final method in methods) {
      if (method.name == _paymentMethod) return method;
    }
    return null;
  }

  bool get _transactionRequired =>
      _needsUpfront || (_selectedPaymentMethod?.requiresTransactionId ?? false);

  bool get _isCashOnDelivery => _paymentMethod.trim().toLowerCase() == 'cash on delivery';

  double get _unitPrice {
    final variantPrice = _selectedVariant?.price ?? 0;
    return variantPrice > 0 ? variantPrice : (_selectedProduct?.price ?? 0);
  }

  double get _totalPrice {
    final qty = int.tryParse(_quantityController.text) ?? 1;
    return (_unitPrice * qty) + _shippingCost;
  }

  Future<void> _selectProduct(ProductModel? product) async {
    if (product == null) return;
    setState(() {
      _selectedProduct = product;
      _variants = const [];
      _selectedVariant = null;
      _detailError = null;
      _isLoadingDetail = true;
    });

    // The list endpoint does not include variants; the detail endpoint does.
    final detail = await context
        .read<ProductsProvider>()
        .fetchProductDetail(widget.businessId, product.id);

    if (!mounted) return;
    setState(() {
      _isLoadingDetail = false;
      if (detail == null) {
        _detailError = 'Could not load this product. Check your connection and try again.';
        _variants = product.variants;
      } else {
        _selectedProduct = detail;
        _variants = detail.variants;
        _selectedVariant = detail.variants.length == 1 ? detail.variants.first : null;
      }
      _applyPaymentDefaults();
    });
  }

  /// A product can switch the store from cash on delivery to prepaid, which invalidates a
  /// previously chosen cash option. Reset to what the effective strategy permits.
  void _applyPaymentDefaults() {
    final methods = _business?.paymentMethods ?? const <PaymentMethodModel>[];
    if (_needsUpfront) {
      final nonCash = methods.where((m) => !_isCashMethodName(m.name)).toList();
      if (nonCash.isEmpty) {
        _paymentMethod = '';
      } else if (_isCashOnDelivery || _paymentMethod.isEmpty) {
        _paymentMethod = nonCash.first.name;
      }
    } else {
      if (_paymentMethod.isEmpty) _paymentMethod = 'Cash on delivery';
    }
  }

  bool _isCashMethodName(String name) {
    final lower = name.trim().toLowerCase();
    return lower == 'cash on delivery' || lower == 'cod' || lower.contains('cash on delivery');
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppTheme.danger),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedProduct == null) {
      _showError('Please select a product from your catalog to place an order.');
      return;
    }

    final methods = _business?.paymentMethods ?? const <PaymentMethodModel>[];
    if (_needsUpfront && methods.isEmpty) {
      _showError(
        'This product requires prepayment, but the store has no payment method configured. '
        'Add one on the Payments page first.',
      );
      return;
    }
    if (_needsUpfront && (_paymentMethod.isEmpty || _isCashOnDelivery)) {
      _showError('Choose a prepaid payment method — cash on delivery cannot be used here.');
      return;
    }
    if (_transactionRequired && _txIdController.text.trim().isEmpty) {
      _showError(
        _needsUpfront
            ? 'Enter the transaction ID from the customer\'s payment confirmation.'
            : '${_paymentMethod.isEmpty ? 'This payment method' : _paymentMethod} needs a transaction ID.',
      );
      return;
    }
    if (_variants.length > 1 && _selectedVariant == null) {
      _showError('Choose which variant the customer is ordering.');
      return;
    }

    setState(() => _isSaving = true);
    final orders = context.read<OrdersProvider>();

    final qty = int.tryParse(_quantityController.text.trim()) ?? 1;
    final phone = _phoneController.text.trim();
    final address = _addressController.text.trim();
    final txId = _txIdController.text.trim();
    final shippingText = _shippingCostController.text.trim();
    final shipping = double.tryParse(shippingText);

    final payload = <String, dynamic>{
      'productId': _selectedProduct!.id,
      if (_selectedVariant != null && _selectedVariant!.id.isNotEmpty)
        'variantId': _selectedVariant!.id,
      'count': qty,
      'customerName': _nameController.text.trim(),
      if (phone.isNotEmpty) 'customerPhone': phone,
      if (address.isNotEmpty) 'customerAddress': address,
      if (shipping != null && shipping >= 0) 'shippingCost': shipping,
      if (_paymentMethod.isNotEmpty) 'paymentMethod': _paymentMethod,
      if (txId.isNotEmpty) 'transactionId': txId,
    };

    final ok = await orders.createOrder(widget.businessId, payload);
    if (!mounted) return;
    setState(() => _isSaving = false);

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Order created successfully!'),
          backgroundColor: AppTheme.success,
        ),
      );
      Navigator.pop(context);
    } else {
      _showError(orders.errorMessage ?? 'Failed to create order');
    }
  }

  @override
  Widget build(BuildContext context) {
    final prods = context.watch<ProductsProvider>();
    final business = context.watch<BusinessProvider>().currentBusiness;
    final methods = business?.paymentMethods ?? const <PaymentMethodModel>[];
    final zones = business?.deliveryZones ?? const <DeliveryZoneModel>[];

    final nonCashMethods = methods.where((m) => !_isCashMethodName(m.name)).toList();
    final paymentOptions = <String>[
      'Cash on delivery',
      ...methods.where((m) => !_isCashMethodName(m.name)).map((m) => m.name),
    ];
    if (_needsUpfront) {
      paymentOptions.remove('Cash on delivery');
    }
    if (_paymentMethod.isNotEmpty && !paymentOptions.contains(_paymentMethod)) {
      paymentOptions.add(_paymentMethod);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Create Manual Order')),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
        ),
        child: SafeArea(
          child: ElevatedButton(
            onPressed: _isSaving ? null : _submit,
            child: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : Text('Place Order (৳${_totalPrice.toStringAsFixed(0)})'),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Customer Card
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Customer Information',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _nameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Customer Full Name *'),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Enter customer name' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Customer Phone',
                      hintText: '017XXXXXXXX',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _addressController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Delivery Address',
                      hintText: 'House, Road, City',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Product selection
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Product Selection *',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  if (prods.isLoading && prods.products.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (prods.products.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedProduct?.id,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Select Product From Catalog *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      validator: (p) => p == null && _selectedProduct == null
                          ? 'Please select a product'
                          : null,
                      items: prods.products.map((p) {
                        return DropdownMenuItem(
                          value: p.id,
                          child: Text(
                            '${p.name} (৳${p.price.toStringAsFixed(0)})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (id) {
                        if (id == null) return;
                        for (final p in prods.products) {
                          if (p.id == id) {
                            _selectProduct(p);
                            break;
                          }
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.amber.shade400),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.warning_amber_rounded, color: Colors.amber),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              prods.errorMessage ??
                                  'No products found in catalog. Create a product first to place orders.',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => prods.fetchProducts(widget.businessId),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Retry'),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (_isLoadingDetail)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 12),
                      child: LinearProgressIndicator(),
                    ),
                  if (_detailError != null) ...[
                    Text(
                      _detailError!,
                      style: const TextStyle(fontSize: 12, color: AppTheme.danger),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (_variants.length > 1) ...[
                    DropdownButtonFormField<ProductVariantModel>(
                      value: _selectedVariant,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Variant *',
                        prefixIcon: Icon(Icons.tune, size: 20),
                      ),
                      validator: (v) =>
                          _variants.length > 1 && v == null ? 'Choose a variant' : null,
                      items: _variants.map((v) {
                        return DropdownMenuItem(
                          value: v,
                          child: Text(
                            '${v.name}${v.price > 0 ? ' — ৳${v.price.toStringAsFixed(0)}' : ''}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (v) => setState(() {
                        _selectedVariant = v;
                        _applyPaymentDefaults();
                      }),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _quantityController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Quantity *'),
                          validator: (v) {
                            final n = int.tryParse((v ?? '').trim());
                            if (n == null || n <= 0) return 'Min 1';
                            if (n > 999) return 'Max 999';
                            return null;
                          },
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: InputDecorator(
                          decoration: const InputDecoration(labelText: 'Unit Price (৳)'),
                          child: Text(
                            _selectedProduct == null
                                ? '—'
                                : '৳${_unitPrice.toStringAsFixed(0)}',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Shipping & Payment
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Delivery & Payment',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  if (zones.isNotEmpty)
                    DropdownButtonFormField<String>(
                      value: _selectedZoneValue,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Delivery area',
                        prefixIcon: Icon(Icons.local_shipping_outlined, size: 20),
                      ),
                      items: zones.map((zone) {
                        return DropdownMenuItem(
                          value: zone.price.toString(),
                          child: Text('${zone.label} — ৳${zone.price.toStringAsFixed(0)}'),
                        );
                      }).toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() {
                          _selectedZoneValue = v;
                          _shippingCostController.text = v;
                          _applyPaymentDefaults();
                        });
                      },
                    )
                  else
                    TextFormField(
                      controller: _shippingCostController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Delivery Charge (৳)',
                        helperText: 'Inside Dhaka: ৳60, Outside: ৳120',
                      ),
                      validator: (v) {
                        final text = (v ?? '').trim();
                        if (text.isEmpty) return null;
                        final value = double.tryParse(text);
                        if (value == null || value < 0) return 'Enter a valid amount';
                        return null;
                      },
                      onChanged: (_) => setState(_applyPaymentDefaults),
                    ),
                  const SizedBox(height: 14),

                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _isOverride
                          ? Colors.amber.withValues(alpha: 0.15)
                          : Colors.grey.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: _isOverride ? Border.all(color: Colors.amber.shade400) : null,
                    ),
                    child: Text(
                      'Payment strategy: ${_strategyLabel(_strategy)}'
                      '${_isOverride ? ' — this product overrides the store default.' : ''}\n'
                      '${_strategy == 'full_prepaid'
                          ? 'The full amount must be paid before the order can be created.'
                          : _strategy == 'delivery_prepaid'
                              ? 'The delivery charge must be paid first; the product price stays payable on delivery.'
                              : 'No advance required. The customer pays on delivery.'}'
                      '${_selectedProduct == null ? ' Pick a product above to see its own rule if it has one.' : ''}',
                      style: const TextStyle(fontSize: 12, height: 1.35),
                    ),
                  ),
                  const SizedBox(height: 14),

                  DropdownButtonFormField<String>(
                    value: _paymentMethod.isEmpty ? null : _paymentMethod,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'Payment Method',
                      suffixText: _paymentMethod.isNotEmpty &&
                              (_selectedPaymentMethod?.requiresTransactionId ?? false)
                          ? 'trx id needed'
                          : null,
                    ),
                    items: paymentOptions.map((name) {
                      return DropdownMenuItem(value: name, child: Text(name));
                    }).toList(),
                    validator: (v) =>
                        _needsUpfront && (v == null || v.isEmpty) ? 'Select a payment method' : null,
                    onChanged: (v) => setState(() => _paymentMethod = v ?? ''),
                  ),
                  if (_needsUpfront && nonCashMethods.isEmpty) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'This strategy needs a prepaid method, but none is configured. '
                      'Add one on the Payments page first.',
                      style: TextStyle(fontSize: 12, color: AppTheme.danger),
                    ),
                  ],
                  if (_selectedPaymentMethod?.info != null &&
                      _selectedPaymentMethod!.info!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Send to: ${_selectedPaymentMethod!.info}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _txIdController,
                    decoration: InputDecoration(
                      labelText: _transactionRequired
                          ? 'Transaction ID *'
                          : 'Transaction ID (if the method needs one)',
                      hintText: 'TrxID from the customer\'s payment confirmation',
                    ),
                    validator: (v) {
                      if (_transactionRequired && (v == null || v.trim().isEmpty)) {
                        return 'Enter the transaction ID';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _needsUpfront
                        ? 'Required: money must be received before this order exists.'
                        : 'Only needed when the chosen method is marked as needing one.',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
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
