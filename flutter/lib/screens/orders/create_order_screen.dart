import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/product.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../widgets/app_card.dart';

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
  final _productNameController = TextEditingController();
  final _unitPriceController = TextEditingController(text: '1200');
  final _quantityController = TextEditingController(text: '1');
  final _shippingCostController = TextEditingController(text: '60');
  final _txIdController = TextEditingController();

  String _paymentMethod = 'Cash on delivery';
  ProductModel? _selectedProduct;
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
    _productNameController.dispose();
    _unitPriceController.dispose();
    _quantityController.dispose();
    _shippingCostController.dispose();
    _txIdController.dispose();
    super.dispose();
  }

  double get _totalPrice {
    final unit = double.tryParse(_unitPriceController.text) ?? 0.0;
    final qty = int.tryParse(_quantityController.text) ?? 1;
    final ship = double.tryParse(_shippingCostController.text) ?? 0.0;
    return (unit * qty) + ship;
  }

  void _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedProduct == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a product from your catalog to place an order.'),
          backgroundColor: AppTheme.danger,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);
    final orders = context.read<OrdersProvider>();

    final qty = int.tryParse(_quantityController.text.trim()) ?? 1;
    final shipping = double.tryParse(_shippingCostController.text.trim());
    final phone = _phoneController.text.trim();
    final address = _addressController.text.trim();
    final txId = _txIdController.text.trim();

    final payload = <String, dynamic>{
      'productId': _selectedProduct!.id,
      if (_selectedProduct!.variantId != null && _selectedProduct!.variantId!.isNotEmpty)
        'variantId': _selectedProduct!.variantId,
      'count': qty,
      'customerName': _nameController.text.trim(),
      if (phone.isNotEmpty) 'customerPhone': phone,
      if (address.isNotEmpty) 'customerAddress': address,
      if (shipping != null && shipping >= 0) 'shippingCost': shipping,
      'paymentMethod': _paymentMethod,
      if (txId.isNotEmpty) 'transactionId': txId,
    };

    final ok = await orders.createOrder(widget.businessId, payload);
    setState(() => _isSaving = false);

    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Order created successfully!'),
          backgroundColor: AppTheme.success,
        ),
      );
      Navigator.pop(context);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(orders.errorMessage ?? 'Failed to create order'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final prods = context.watch<ProductsProvider>();

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
                  const Text('Customer Information', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Customer Full Name *'),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Enter customer name' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Customer Phone Number *', hintText: '017XXXXXXXX'),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Enter phone number' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _addressController,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Delivery Address *', hintText: 'House, Road, City'),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Enter delivery address' : null,
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
                  const Text('Product Selection *', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  if (prods.products.isNotEmpty) ...[
                    DropdownButtonFormField<ProductModel>(
                      value: _selectedProduct,
                      decoration: const InputDecoration(
                        labelText: 'Select Product From Catalog *',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      validator: (p) => p == null && _selectedProduct == null ? 'Please select a product' : null,
                      items: prods.products.map((p) {
                        return DropdownMenuItem(
                          value: p,
                          child: Text(
                            '${p.name} (৳${p.price.toStringAsFixed(0)})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (p) {
                        if (p != null) {
                          setState(() {
                            _selectedProduct = p;
                            _productNameController.text = p.name;
                            _unitPriceController.text = p.price.toStringAsFixed(0);
                          });
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
                          const Expanded(
                            child: Text(
                              'No products found in catalog. Create a product first to place orders.',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
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
                            final n = int.tryParse(v ?? '');
                            if (n == null || n <= 0) return 'Min 1';
                            return null;
                          },
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _unitPriceController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Unit Price (৳)'),
                          onChanged: (_) => setState(() {}),
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
                  const Text('Delivery & Payment', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _shippingCostController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Delivery Charge (৳)',
                      helperText: 'Inside Dhaka: ৳60, Outside: ৳120',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: _paymentMethod,
                    decoration: const InputDecoration(labelText: 'Payment Method'),
                    items: const [
                      DropdownMenuItem(value: 'Cash on delivery', child: Text('Cash on Delivery (COD)')),
                      DropdownMenuItem(value: 'bKash', child: Text('bKash')),
                      DropdownMenuItem(value: 'Nagad', child: Text('Nagad')),
                      DropdownMenuItem(value: 'Bank Transfer', child: Text('Bank Transfer')),
                    ],
                    onChanged: (v) => setState(() => _paymentMethod = v ?? 'Cash on delivery'),
                  ),
                  if (_paymentMethod != 'Cash on delivery') ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _txIdController,
                      decoration: const InputDecoration(
                        labelText: 'Transaction Reference ID *',
                        hintText: 'e.g. 9JA27BX4',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
