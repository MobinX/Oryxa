import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';

class BusinessPickerScreen extends StatefulWidget {
  const BusinessPickerScreen({super.key});

  @override
  State<BusinessPickerScreen> createState() => _BusinessPickerScreenState();
}

class _BusinessPickerScreenState extends State<BusinessPickerScreen> {
  final _newStoreNameController = TextEditingController();
  final _newStoreDescController = TextEditingController();

  @override
  void dispose() {
    _newStoreNameController.dispose();
    _newStoreDescController.dispose();
    super.dispose();
  }

  void _showCreateStoreDialog() {
    _newStoreNameController.clear();
    _newStoreDescController.clear();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create New Business'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _newStoreNameController,
              decoration: const InputDecoration(
                labelText: 'Business Name',
                hintText: 'e.g. Dhaka Fashion Store',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newStoreDescController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                hintText: 'What products or services do you offer?',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final name = _newStoreNameController.text.trim();
              if (name.isEmpty) return;
              Navigator.pop(ctx);

              final biz = context.read<BusinessProvider>();
              final success = await biz.createBusiness(
                name,
                description: _newStoreDescController.text.trim(),
              );
              if (success && mounted && biz.currentBusiness != null) {
                await context.read<AuthProvider>().selectBusiness(biz.currentBusiness!.id);
              } else if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(biz.errorMessage ?? 'Failed to create business'),
                    backgroundColor: AppTheme.danger,
                  ),
                );
              }
            },
            child: const Text('Create Store'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Store / Business'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Create New Store',
            onPressed: _showCreateStoreDialog,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out',
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: biz.isLoading
          ? const Center(child: CircularProgressIndicator())
          : biz.businesses.isEmpty
              ? EmptyState(
                  icon: Icons.store_outlined,
                  title: 'No Stores Found',
                  description: 'Create your first business store to start managing products, conversations, and orders.',
                  buttonText: 'Create New Store',
                  onButtonPressed: _showCreateStoreDialog,
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: biz.businesses.length,
                  itemBuilder: (context, index) {
                    final b = biz.businesses[index];
                    final isSelected = biz.currentBusiness?.id == b.id;

                    return AppCard(
                      border: isSelected
                          ? const BorderSide(color: AppTheme.primaryColor, width: 2)
                          : null,
                      onTap: () async {
                        biz.setCurrentBusiness(b);
                        await auth.selectBusiness(b.id);
                      },
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppTheme.primaryColor
                                  : AppTheme.primaryColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.storefront_outlined,
                              color: isSelected ? Colors.white : AppTheme.primaryColor,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        b.name,
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    if (isSelected)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppTheme.primaryColor.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: const Text(
                                          'Active',
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: AppTheme.primaryColor,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  b.slug != null && b.slug!.isNotEmpty
                                      ? 'store/${b.slug}'
                                      : (b.description ?? 'Online store'),
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: Colors.grey.shade600,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Icon(
                            Icons.chevron_right,
                            color: Colors.grey.shade400,
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
