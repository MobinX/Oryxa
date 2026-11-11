import 'package:flutter/material.dart';
import '../../config/app_theme.dart';
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

  @override
  void dispose() {
    _insideDhakaController.dispose();
    _outsideDhakaController.dispose();
    _bkashNumberController.dispose();
    _nagadNumberController.dispose();
    super.dispose();
  }

  void _saveSettings() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Payment and delivery settings saved!')),
    );
  }

  @override
  Widget build(BuildContext context) {
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
            onPressed: _saveSettings,
            child: const Text('Save Payment & Delivery Rules'),
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
