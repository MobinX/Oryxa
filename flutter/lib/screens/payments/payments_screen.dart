import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/business.dart';
import '../../providers/business_provider.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  final _insideDhakaController = TextEditingController(text: '60');
  final _outsideDhakaController = TextEditingController(text: '120');
  final _bkashNumberController = TextEditingController(text: '01700000000');
  final _nagadNumberController = TextEditingController(text: '01800000000');

  bool _enableCod = true;
  bool _enableBkash = true;
  bool _enableNagad = true;
  String _paymentStrategy = 'cod'; // 'cod', 'partial_advance', 'full_advance'
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadFromBusiness());
  }

  void _loadFromBusiness() {
    final business = context.read<BusinessProvider>().currentBusiness;
    if (business == null) return;
    final zones = business.deliveryZones;
    for (final z in zones) {
      final label = z.label.toLowerCase();
      if (label.contains('inside')) {
        _insideDhakaController.text = z.price.toStringAsFixed(0);
      } else if (label.contains('outside')) {
        _outsideDhakaController.text = z.price.toStringAsFixed(0);
      }
    }
    final methods = business.paymentMethods.map((m) => m.name.toLowerCase()).toList();
    _enableCod = methods.any((n) => n.contains('cash'));
    _enableBkash = methods.any((n) => n.contains('bkash'));
    _enableNagad = methods.any((n) => n.contains('nagad'));
    for (final m in business.paymentMethods) {
      final name = m.name.toLowerCase();
      if (name.contains('bkash') && m.info != null) {
        _bkashNumberController.text = m.info!;
      }
      if (name.contains('nagad') && m.info != null) {
        _nagadNumberController.text = m.info!;
      }
    }
    final strategy = business.paymentStrategy;
    if (strategy == 'delivery_prepaid') {
      _paymentStrategy = 'partial_advance';
    } else if (strategy == 'full_prepaid') {
      _paymentStrategy = 'full_advance';
    } else {
      _paymentStrategy = 'cod';
    }
    setState(() {});
  }

  @override
  void dispose() {
    _insideDhakaController.dispose();
    _outsideDhakaController.dispose();
    _bkashNumberController.dispose();
    _nagadNumberController.dispose();
    super.dispose();
  }

  Future<void> _saveSettings() async {
    final business = context.read<BusinessProvider>().currentBusiness;
    if (business == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No store selected.')),
      );
      return;
    }

    final inside = double.tryParse(_insideDhakaController.text.trim()) ?? 0;
    final outside = double.tryParse(_outsideDhakaController.text.trim()) ?? 0;

    final methods = <PaymentMethodModel>[];
    if (_enableCod) {
      methods.add(PaymentMethodModel(name: 'Cash on Delivery'));
    }
    if (_enableBkash) {
      methods.add(PaymentMethodModel(name: 'bKash', info: _bkashNumberController.text.trim()));
    }
    if (_enableNagad) {
      methods.add(PaymentMethodModel(name: 'Nagad', info: _nagadNumberController.text.trim()));
    }

    String strategy = 'cod';
    if (_paymentStrategy == 'partial_advance') strategy = 'delivery_prepaid';
    if (_paymentStrategy == 'full_advance') strategy = 'full_prepaid';

    setState(() => _isSaving = true);
    final ok = await context.read<BusinessProvider>().updatePaymentDeliverySettings(
          deliveryZones: [
            DeliveryZoneModel(label: 'Inside Dhaka', price: inside),
            DeliveryZoneModel(label: 'Outside Dhaka', price: outside),
          ],
          paymentMethods: methods,
          paymentStrategy: strategy,
        );
    if (!mounted) return;
    setState(() => _isSaving = false);

    if (ok) {
      appDiagnostics.recordMessage('Payments', 'Payment and delivery settings saved.');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment and delivery settings saved!')),
      );
    } else {
      final err = context.read<BusinessProvider>().errorMessage ?? 'Save failed.';
      appDiagnostics.recordMessage('Payments', 'Save failed: $err');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = context.watch<BusinessProvider>().currentBusiness;
    if (business == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Payments & Delivery')),
        body: const Center(child: Text('Select a store first.')),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Payments & Delivery')),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
        ),
        child: SafeArea(
          child: ElevatedButton(
            onPressed: _isSaving ? null : _saveSettings,
            child: _isSaving
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Save Payment & Delivery Rules'),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Delivery Charges
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Delivery Charges', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'The AI quotes these rates when customers inquire about delivery fees.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _insideDhakaController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Inside Dhaka Delivery (৳)',
                    prefixIcon: Icon(Icons.location_city),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _outsideDhakaController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Outside Dhaka Delivery (৳)',
                    prefixIcon: Icon(Icons.local_shipping_outlined),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Payment Methods
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Accepted Payment Methods', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Cash on Delivery (COD)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('Customers pay upon courier package delivery'),
                  value: _enableCod,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _enableCod = v),
                ),
                const Divider(),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('bKash Merchant / Personal', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('Direct wallet payment'),
                  value: _enableBkash,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _enableBkash = v),
                ),
                if (_enableBkash) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _bkashNumberController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'bKash Account Number',
                      prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                const Divider(),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Nagad Payment', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('Nagad wallet payment'),
                  value: _enableNagad,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _enableNagad = v),
                ),
                if (_enableNagad) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _nagadNumberController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Nagad Account Number',
                      prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Payment Strategy
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Payment Strategy (Anti-Fraud Policy)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'Control whether orders require partial delivery advance to prevent fake parcels.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 12),
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Full Cash on Delivery (COD)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  subtitle: const Text('No advance required. AI creates order directly.'),
                  value: 'cod',
                  groupValue: _paymentStrategy,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _paymentStrategy = v!),
                ),
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Partial Advance (Delivery Charge Only)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Customer pays delivery charge in advance, product cost on delivery.'),
                  value: 'partial_advance',
                  groupValue: _paymentStrategy,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _paymentStrategy = v!),
                ),
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Full Advance Payment', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Order confirmed only after 100% payment receipt.'),
                  value: 'full_advance',
                  groupValue: _paymentStrategy,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (v) => setState(() => _paymentStrategy = v!),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
