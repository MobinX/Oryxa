import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../config/app_theme.dart';
import '../../models/product.dart';
import '../../providers/products_provider.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_feedback.dart';

class ProductFormScreen extends StatefulWidget {
  final String businessId;
  final ProductModel? product;

  const ProductFormScreen({
    super.key,
    required this.businessId,
    this.product,
  });

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _scrollController = ScrollController();

  late TextEditingController _nameController;
  late TextEditingController _descController;
  late TextEditingController _priceController;
  late TextEditingController _regularPriceController;
  late TextEditingController _stockController;
  late TextEditingController _skuController;
  late TextEditingController _imageUrlController;

  String? _selectedCategoryId;
  String? _existingVariantId;
  bool _isSaving = false;

  bool get _isEditing => widget.product != null;

  Future<void> _pickAndUploadImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    if (!mounted) return;
    setState(() => _isSaving = true);
    try {
      final api = context.read<ApiService>();
      final uri = Uri.parse('${api.baseUrl}/${widget.businessId}/uploads/image');
      final req = http.MultipartRequest('POST', uri);
      req.headers['Authorization'] = 'Bearer ${api.token}';
      req.files.add(await http.MultipartFile.fromPath('file', picked.path));
      final streamed = await req.send().timeout(const Duration(seconds: 60));
      final body = await streamed.stream.bytesToString();
      if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
        throw Exception('Upload failed (HTTP ${streamed.statusCode}): $body');
      }
      final json = jsonDecode(body);
      final url = json is Map ? (json['url'] ?? json['key'])?.toString() : null;
      if (url != null && url.isNotEmpty) {
        _imageUrlController.text = url;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Image uploaded.')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _nameController = TextEditingController(text: p?.name ?? '');
    _descController = TextEditingController(text: p?.description ?? '');
    _priceController = TextEditingController(text: p != null ? p.price.toStringAsFixed(0) : '');
    final initialRegular = p != null && p.hasDiscount && p.discountPercent > 0 && p.discountPercent < 100
        ? p.price / (1 - p.discountPercent / 100)
        : p?.regularPrice;
    _regularPriceController = TextEditingController(
      text: initialRegular != null ? initialRegular.toStringAsFixed(0) : '',
    );
    _stockController = TextEditingController(text: p != null ? p.stock.toString() : '10');
    _skuController = TextEditingController(text: p?.sku ?? '');
    _imageUrlController = TextEditingController(text: p?.imageUrl ?? '');
    _selectedCategoryId = p?.categoryId;
    _existingVariantId = p?.variantId;

    if (_isEditing) {
      _loadProductDetails();
    }
  }

  void _loadProductDetails() async {
    final prods = context.read<ProductsProvider>();
    final detailed = await prods.fetchProductDetail(widget.businessId, widget.product!.id);
    if (detailed != null && mounted) {
      setState(() {
        if (_existingVariantId == null && detailed.variantId != null) {
          _existingVariantId = detailed.variantId;
        }
        if (_stockController.text == '0' && detailed.stock > 0) {
          _stockController.text = detailed.stock.toString();
        }
        if (_imageUrlController.text.isEmpty && detailed.imageUrl != null) {
          _imageUrlController.text = detailed.imageUrl!;
        }
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _priceController.dispose();
    _regularPriceController.dispose();
    _stockController.dispose();
    _skuController.dispose();
    _imageUrlController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _submit() async {
    final scope = _isEditing ? 'Edit product' : 'Add product';
    appDiagnostics.recordMessage(scope, 'Save button tapped');

    if (!_formKey.currentState!.validate()) {
      appDiagnostics.recordMessage(
        scope,
        'Save blocked: required fields are missing or invalid',
        details: 'Title "${_nameController.text.trim()}", '
            'sale price "${_priceController.text.trim()}", '
            'regular price "${_regularPriceController.text.trim()}", '
            'stock "${_stockController.text.trim()}"',
      );
      showAppSnack(
        'Check the highlighted fields before saving.',
        isError: true,
      );
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
      return;
    }

    setState(() => _isSaving = true);
    final prods = context.read<ProductsProvider>();

    final price = double.tryParse(_priceController.text.trim()) ?? 0.0;
    final stock = int.tryParse(_stockController.text.trim()) ?? 0;
    final regularPrice = double.tryParse(_regularPriceController.text.trim());
    final sku = _skuController.text.trim().isNotEmpty
        ? _skuController.text.trim()
        : 'SKU-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';
    final desc = _descController.text.trim();
    final imgUrl = _imageUrlController.text.trim();

    // The API stores the selling price plus an optional discount percentage; the form asks
    // for the pre-discount price because that is how merchants quote it. A "regular" price
    // that is not above the selling price is not a discount, so it is ignored.
    final hasDiscount = regularPrice != null && regularPrice > price;
    final discountPercent = hasDiscount
        ? double.parse(
            (((regularPrice - price) / regularPrice) * 100).clamp(0, 100).toStringAsFixed(2),
          )
        : 0.0;

    final variantItem = <String, dynamic>{
      if (_existingVariantId != null && _existingVariantId!.isNotEmpty)
        'id': _existingVariantId,
      'name': 'Default',
      'stock': stock,
      'price': price,
      if (imgUrl.isNotEmpty) 'imageUrl': imgUrl,
    };

    final payload = <String, dynamic>{
      'name': _nameController.text.trim(),
      'price': price,
      'currency': 'BDT',
      'sku': sku,
      if (desc.isNotEmpty) 'description': desc,
      if (_selectedCategoryId != null && _selectedCategoryId!.isNotEmpty)
        'categoryId': _selectedCategoryId,
      'hasDiscount': hasDiscount,
      'discountPercent': discountPercent,
      'showInStorefront': widget.product?.showInStorefront ?? true,
      'variants': [variantItem],
    };

    bool ok;
    try {
      if (_isEditing) {
        ok = await prods.updateProduct(widget.businessId, widget.product!.id, payload);
      } else {
        ok = await prods.createProduct(widget.businessId, payload);
      }
    } catch (e, stack) {
      appDiagnostics.record('$scope submit', e, stack);
      if (!mounted) return;
      setState(() => _isSaving = false);
      showAppSnack('Save failed: $e', isError: true);
      return;
    }

    if (!mounted) return;
    setState(() => _isSaving = false);

    if (ok && mounted) {
      appDiagnostics.recordMessage(scope, _isEditing ? 'Product updated' : 'Product created');
      showAppSnack(_isEditing ? 'Product updated successfully' : 'Product created successfully');
      Navigator.pop(context);
    } else if (mounted) {
      final message = prods.errorMessage ?? 'Failed to save product. Please check fields.';
      appDiagnostics.recordMessage(scope, 'Save failed: $message');
      showAppSnack(message, isError: true);
    }
  }

  void _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Product?'),
        content: const Text('Are you sure you want to remove this product from your catalog?'),
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
      final prods = context.read<ProductsProvider>();
      final ok = await prods.deleteProduct(widget.businessId, widget.product!.id);
      if (ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Product removed from catalog')),
        );
        Navigator.pop(context);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(prods.errorMessage ?? 'Failed to delete product'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final prods = context.watch<ProductsProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Product' : 'Add New Product'),
        actions: [
          if (_isEditing)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
              onPressed: _delete,
            ),
        ],
      ),
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
                : Text(_isEditing ? 'Update Product' : 'Save Product'),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          controller: _scrollController,
          padding: const EdgeInsets.all(16),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Product Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Product Title *', hintText: 'e.g. Cotton Polo Shirt'),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Enter product title' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _descController,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Description', hintText: 'Fabric details, sizes, colors...'),
                  ),
                  const SizedBox(height: 12),
                  if (prods.categories.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedCategoryId,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('No Category')),
                        ...prods.categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))),
                      ],
                      onChanged: (v) => setState(() => _selectedCategoryId = v),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _priceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'Sale Price (৳) *'),
                          validator: (v) {
                            final value = double.tryParse((v ?? '').trim());
                            if (value == null || value <= 0) return 'Enter a price above 0';
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _regularPriceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(
                            labelText: 'Regular Price (৳)',
                            helperText: 'Optional — shows a discount',
                          ),
                          validator: (v) {
                            final text = (v ?? '').trim();
                            if (text.isEmpty) return null;
                            final value = double.tryParse(text);
                            if (value == null || value <= 0) return 'Enter a valid price';
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _stockController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Stock Units *'),
                          validator: (v) {
                            final value = int.tryParse((v ?? '').trim());
                            if (value == null || value < 0) return 'Enter stock (0 or more)';
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _skuController,
                          decoration: const InputDecoration(labelText: 'SKU Code', hintText: 'e.g. POLO-01'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Image & Media', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _imageUrlController,
                    decoration: const InputDecoration(
                      labelText: 'Primary Image URL',
                      hintText: 'https://...',
                      prefixIcon: Icon(Icons.link),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _isSaving ? null : _pickAndUploadImage,
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Upload image from gallery'),
                  ),
                  if (_imageUrlController.text.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        height: 160,
                        width: double.infinity,
                        color: Colors.grey.withValues(alpha: 0.1),
                        child: Image.network(
                          _imageUrlController.text.trim(),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Center(
                            child: Icon(Icons.image_not_supported_outlined, color: Colors.grey),
                          ),
                        ),
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
