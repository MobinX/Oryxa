import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_theme.dart';
import '../../models/customer.dart';
import '../../providers/customers_provider.dart';
import '../../widgets/app_card.dart';

class CustomerDetailScreen extends StatefulWidget {
  final CustomerModel customer;
  final String businessId;

  const CustomerDetailScreen({
    super.key,
    required this.customer,
    required this.businessId,
  });

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  late CustomerModel _customer;
  bool _isUpdating = false;

  @override
  void initState() {
    super.initState();
    _customer = widget.customer;
  }

  void _showEditCustomerDialog() {
    final nameCtrl = TextEditingController(text: _customer.name);
    final phoneCtrl = TextEditingController(text: _customer.phone ?? '');
    final emailCtrl = TextEditingController(text: _customer.email ?? '');
    final addressCtrl = TextEditingController(text: _customer.address ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Customer Profile'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
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
                  labelText: 'Phone Number',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  prefixIcon: Icon(Icons.email_outlined),
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
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final name = nameCtrl.text.trim();
              if (name.isEmpty) return;
              final phone = phoneCtrl.text.trim();
              final email = emailCtrl.text.trim();
              final address = addressCtrl.text.trim();

              Navigator.pop(ctx);
              setState(() => _isUpdating = true);

              final customers = context.read<CustomersProvider>();
              final payload = <String, dynamic>{
                'name': name,
                if (phone.isNotEmpty) 'phone': phone,
                if (email.isNotEmpty) 'email': email,
                if (address.isNotEmpty) 'address': address,
              };

              final ok = await customers.updateCustomer(widget.businessId, _customer.id, payload);
              if (ok && mounted) {
                final fresh = await customers.fetchCustomerDetail(widget.businessId, _customer.id);
                setState(() {
                  if (fresh != null) {
                    _customer = fresh;
                  } else {
                    _customer = CustomerModel(
                      id: _customer.id,
                      name: name,
                      phone: phone.isNotEmpty ? phone : null,
                      email: email.isNotEmpty ? email : null,
                      address: address.isNotEmpty ? address : null,
                      totalSpend: _customer.totalSpend,
                      orderCount: _customer.orderCount,
                      notes: _customer.notes,
                    );
                  }
                  _isUpdating = false;
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Customer updated successfully!'), backgroundColor: AppTheme.success),
                );
              } else if (mounted) {
                setState(() => _isUpdating = false);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(customers.errorMessage ?? 'Failed to update customer'),
                    backgroundColor: AppTheme.danger,
                  ),
                );
              }
            },
            child: const Text('Save Changes'),
          ),
        ],
      ),
    );
  }

  void _deleteCustomer() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Customer?'),
        content: Text('Are you sure you want to remove "${_customer.name}"? This action cannot be undone.'),
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
      final customers = context.read<CustomersProvider>();
      final ok = await customers.deleteCustomer(widget.businessId, _customer.id);
      if (ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Customer deleted')),
        );
        Navigator.pop(context);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(customers.errorMessage ?? 'Failed to delete customer'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_customer.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit Customer',
            onPressed: _showEditCustomerDialog,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
            tooltip: 'Delete Customer',
            onPressed: _deleteCustomer,
          ),
        ],
      ),
      body: _isUpdating
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Profile Card
                AppCard(
                  child: Column(
                    children: [
                      CircleAvatar(
                        radius: 36,
                        backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                        child: Text(
                          _customer.name.isNotEmpty ? _customer.name.substring(0, 1).toUpperCase() : 'C',
                          style: const TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _customer.name,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      if (_customer.phone != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          _customer.phone!,
                          style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (_customer.phone != null)
                            ElevatedButton.icon(
                              onPressed: () => launchUrl(Uri.parse('tel:${_customer.phone}')),
                              icon: const Icon(Icons.phone, size: 16),
                              label: const Text('Call'),
                            ),
                          const SizedBox(width: 12),
                          if (_customer.email != null)
                            OutlinedButton.icon(
                              onPressed: () => launchUrl(Uri.parse('mailto:${_customer.email}')),
                              icon: const Icon(Icons.email, size: 16),
                              label: const Text('Email'),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Lifetime Stats
                Row(
                  children: [
                    Expanded(
                      child: AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Total Spend', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                            const SizedBox(height: 4),
                            Text(
                              _customer.formattedSpend,
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Total Orders', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                            const SizedBox(height: 4),
                            Text(
                              '${_customer.orderCount}',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Address & Notes
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Delivery Address', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                          TextButton.icon(
                            onPressed: _showEditCustomerDialog,
                            icon: const Icon(Icons.edit_outlined, size: 16),
                            label: const Text('Edit'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _customer.address ?? 'No address registered.',
                        style: const TextStyle(fontSize: 13, height: 1.4),
                      ),
                      if (_customer.notes != null && _customer.notes!.isNotEmpty) ...[
                        const Divider(height: 24),
                        const Text('Merchant Notes', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 8),
                        Text(
                          _customer.notes!,
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700, fontStyle: FontStyle.italic),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
