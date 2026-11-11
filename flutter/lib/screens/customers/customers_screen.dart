import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/customer.dart';
import '../../providers/business_provider.dart';
import '../../providers/customers_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';
import 'customer_detail_screen.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final biz = context.read<BusinessProvider>();
      if (biz.currentBusiness != null) {
        context.read<CustomersProvider>().fetchCustomers(biz.currentBusiness!.id);
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showAddCustomerDialog(String businessId) {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final addressCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add New Customer'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                autofocus: true,
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

              final payload = <String, dynamic>{
                'name': name,
                if (phone.isNotEmpty) 'phone': phone,
                if (email.isNotEmpty) 'email': email,
                if (address.isNotEmpty) 'address': address,
              };

              final customers = context.read<CustomersProvider>();
              final ok = await customers.createCustomer(businessId, payload);
              if (ok && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Customer added successfully!'), backgroundColor: AppTheme.success),
                );
              } else if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(customers.errorMessage ?? 'Failed to add customer'),
                    backgroundColor: AppTheme.danger,
                  ),
                );
              }
            },
            child: const Text('Add Customer'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final customers = context.watch<CustomersProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final list = customers.customers;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customers CRM'),
        actions: [
          if (currentStore != null)
            IconButton(
              icon: const Icon(Icons.person_add_outlined),
              tooltip: 'Add Customer',
              onPressed: () => _showAddCustomerDialog(currentStore.id),
            ),
        ],
      ),
      floatingActionButton: currentStore != null
          ? FloatingActionButton.extended(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
              onPressed: () => _showAddCustomerDialog(currentStore.id),
              icon: const Icon(Icons.person_add, size: 20),
              label: const Text('New Customer'),
            )
          : null,
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
            child: TextField(
              controller: _searchController,
              onChanged: (q) => customers.setSearchQuery(q),
              decoration: InputDecoration(
                hintText: 'Search customer name, phone, or email...',
                prefixIcon: const Icon(Icons.search, size: 20),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          customers.setSearchQuery('');
                        },
                      )
                    : null,
              ),
            ),
          ),
          const Divider(height: 1),

          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                if (currentStore != null) {
                  await customers.fetchCustomers(currentStore.id);
                }
              },
              child: customers.isLoading && list.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : list.isEmpty
                      ? EmptyState(
                          icon: Icons.people_outline,
                          title: 'No Customers Yet',
                          description: 'Add customers manually or let the AI closer automatically record Messenger and web buyers.',
                          buttonText: currentStore != null ? 'Add Customer' : null,
                          onButtonPressed: currentStore != null ? () => _showAddCustomerDialog(currentStore.id) : null,
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: list.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final c = list[index];

                            return AppCard(
                              onTap: () {
                                if (currentStore != null) {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => CustomerDetailScreen(
                                        customer: c,
                                        businessId: currentStore.id,
                                      ),
                                    ),
                                  );
                                }
                              },
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 24,
                                    backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.12),
                                    child: Text(
                                      c.name.isNotEmpty ? c.name.substring(0, 1).toUpperCase() : 'C',
                                      style: const TextStyle(
                                        color: AppTheme.primaryColor,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          c.name,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          c.phone ?? c.email ?? 'No contact info',
                                          style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        c.formattedSpend,
                                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${c.orderCount} orders',
                                        style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
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
}
