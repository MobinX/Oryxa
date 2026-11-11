import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/products_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/empty_state.dart';
import 'categories_screen.dart';
import 'product_form_screen.dart';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  final _searchController = TextEditingController();

  void _showNoStore(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('No store is loaded yet. Pull to refresh, then try again.'),
        backgroundColor: AppTheme.danger,
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final prods = context.watch<ProductsProvider>();
    final currentStore = biz.currentBusiness;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final productList = prods.products;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        onPressed: () {
          if (currentStore == null) {
            _showNoStore(context);
            return;
          }
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ProductFormScreen(businessId: currentStore.id),
            ),
          );
        },
        icon: const Icon(Icons.add, size: 20),
        label: const Text('Add Product'),
      ),
      body: Column(
        children: [
          // Filter & Search Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (q) => prods.setSearchQuery(q),
                        decoration: InputDecoration(
                          hintText: 'Search products by name or SKU...',
                          prefixIcon: const Icon(Icons.search, size: 20),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.clear, size: 18),
                                  onPressed: () {
                                    _searchController.clear();
                                    prods.setSearchQuery('');
                                  },
                                )
                              : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.category_outlined),
                      tooltip: 'Manage Categories',
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const CategoriesScreen()),
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Category Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _categoryChip(
                        label: 'All Categories',
                        selected: prods.selectedCategoryId == null,
                        onTap: () => prods.setCategoryFilter(null),
                      ),
                      const SizedBox(width: 6),
                      ...prods.categories.map((c) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: _categoryChip(
                            label: c.name,
                            selected: prods.selectedCategoryId == c.id,
                            onTap: () => prods.setCategoryFilter(c.id),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Products List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                if (currentStore != null) {
                  await prods.fetchProducts(currentStore.id);
                }
              },
              child: prods.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : productList.isEmpty
                      ? EmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: 'No Products in Catalog',
                          description:
                              'Add your first product to allow the AI sales agent to quote prices and close orders.',
                          buttonText: 'Add Product',
                          onButtonPressed: () {
                            if (currentStore == null) {
                              _showNoStore(context);
                              return;
                            }
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ProductFormScreen(businessId: currentStore.id),
                              ),
                            );
                          },
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          itemCount: productList.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final p = productList[index];

                            return AppCard(
                              onTap: () {
                                if (currentStore == null) {
                                  _showNoStore(context);
                                  return;
                                }
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ProductFormScreen(
                                      businessId: currentStore.id,
                                      product: p,
                                    ),
                                  ),
                                );
                              },
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Product Image Thumbnail
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: Container(
                                      width: 64,
                                      height: 64,
                                      color: Colors.grey.withValues(alpha: 0.1),
                                      child: p.imageUrl != null && p.imageUrl!.isNotEmpty
                                          ? CachedNetworkImage(
                                              imageUrl: p.imageUrl!,
                                              fit: BoxFit.cover,
                                              errorWidget: (_, __, ___) => const Icon(
                                                Icons.image_not_supported_outlined,
                                                color: Colors.grey,
                                              ),
                                            )
                                          : const Icon(Icons.inventory_2_outlined, color: Colors.grey),
                                    ),
                                  ),
                                  const SizedBox(width: 14),

                                  // Product Info
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          p.name,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          children: [
                                            Text(
                                              p.formattedPrice,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w900,
                                                fontSize: 15,
                                                color: AppTheme.primaryColor,
                                              ),
                                            ),
                                            if (p.formattedRegularPrice != null) ...[
                                              const SizedBox(width: 8),
                                              Text(
                                                p.formattedRegularPrice!,
                                                style: TextStyle(
                                                  decoration: TextDecoration.lineThrough,
                                                  color: Colors.grey.shade500,
                                                  fontSize: 12,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Row(
                                          children: [
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: p.stock > 0
                                                    ? AppTheme.successBg
                                                    : AppTheme.dangerBg,
                                                borderRadius: BorderRadius.circular(6),
                                              ),
                                              child: Text(
                                                p.stock > 0 ? '${p.stock} in stock' : 'Out of stock',
                                                style: TextStyle(
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.bold,
                                                  color: p.stock > 0
                                                      ? AppTheme.success
                                                      : AppTheme.danger,
                                                ),
                                              ),
                                            ),
                                            if (p.sku != null && p.sku!.isNotEmpty) ...[
                                              const SizedBox(width: 8),
                                              Text(
                                                'SKU: ${p.sku}',
                                                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.chevron_right, size: 20, color: Colors.grey),
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

  Widget _categoryChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primaryColor
              : (Theme.of(context).brightness == Brightness.dark
                  ? AppTheme.cardDark
                  : Colors.grey.shade100),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primaryColor : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.bold : FontWeight.w500,
            color: selected ? Colors.white : null,
          ),
        ),
      ),
    );
  }
}
