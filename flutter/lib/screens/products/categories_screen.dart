import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/products_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';

class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  final _newCategoryController = TextEditingController();

  @override
  void dispose() {
    _newCategoryController.dispose();
    super.dispose();
  }

  void _showAddCategoryDialog() {
    _newCategoryController.clear();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Category'),
        content: TextField(
          controller: _newCategoryController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Category Name',
            hintText: 'e.g. Menswear, Electronics, Shoes',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final name = _newCategoryController.text.trim();
              if (name.isEmpty) return;
              Navigator.pop(ctx);

              final biz = context.read<BusinessProvider>();
              if (biz.currentBusiness != null) {
                final ok = await context.read<ProductsProvider>().createCategory(biz.currentBusiness!.id, name);
                if (!ok && mounted) {
                  final err = context.read<ProductsProvider>().errorMessage ?? 'Failed to add category';
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(err), backgroundColor: AppTheme.danger),
                  );
                }
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showEditCategoryDialog(CategoryModel cat) {
    final editController = TextEditingController(text: cat.name);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Category'),
        content: TextField(
          controller: editController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Category Name',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final name = editController.text.trim();
              if (name.isEmpty) return;
              Navigator.pop(ctx);

              final biz = context.read<BusinessProvider>();
              if (biz.currentBusiness != null) {
                final ok = await context.read<ProductsProvider>().updateCategory(biz.currentBusiness!.id, cat.id, name);
                if (!ok && mounted) {
                  final err = context.read<ProductsProvider>().errorMessage ?? 'Failed to update category';
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(err), backgroundColor: AppTheme.danger),
                  );
                } else if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Category updated')),
                  );
                }
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _deleteCategory(CategoryModel cat) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Category?'),
        content: Text('Are you sure you want to delete "${cat.name}"?'),
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
      final biz = context.read<BusinessProvider>();
      if (biz.currentBusiness != null) {
        final ok = await context.read<ProductsProvider>().deleteCategory(biz.currentBusiness!.id, cat.id);
        if (ok && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Category deleted')),
          );
        } else if (mounted) {
          final err = context.read<ProductsProvider>().errorMessage ?? 'Failed to delete category';
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(err), backgroundColor: AppTheme.danger),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final prods = context.watch<ProductsProvider>();
    final currentStore = biz.currentBusiness;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Product Categories'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Category',
            onPressed: _showAddCategoryDialog,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        onPressed: _showAddCategoryDialog,
        icon: const Icon(Icons.add, size: 20),
        label: const Text('New Category'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          if (currentStore != null) {
            await prods.fetchCategories(currentStore.id);
          }
        },
        child: prods.categories.isEmpty
            ? EmptyState(
                icon: Icons.category_outlined,
                title: 'No Categories',
                description: 'Group your products into categories to help customers and AI discover items easily.',
                buttonText: 'Add Category',
                onButtonPressed: _showAddCategoryDialog,
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: prods.categories.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final cat = prods.categories[index];

                  return AppCard(
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.folder_outlined, color: AppTheme.primaryColor),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                cat.name,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                              ),
                              if (cat.slug != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  '/${cat.slug}',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                                ),
                              ],
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit_outlined, size: 20),
                          tooltip: 'Edit Category',
                          onPressed: () => _showEditCategoryDialog(cat),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, size: 20, color: AppTheme.danger),
                          tooltip: 'Delete Category',
                          onPressed: () => _deleteCategory(cat),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
