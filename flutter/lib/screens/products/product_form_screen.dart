import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../providers/customers_provider.dart';
import '../../providers/products_provider.dart';
import '../../services/diagnostics_service.dart';
import '../../utils/product_utils.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_feedback.dart';
import '../../widgets/variant_photo_dialog.dart';

const int kMaxImagesPerVariant = 8;
const int kMaxOptions = 3;
const int kMaxOptionValues = 50;

class _WizardOptionDraft {
  String name;
  List<String> values;
  final TextEditingController valueDraftController = TextEditingController();

  _WizardOptionDraft({required this.name, List<String>? values})
      : values = values != null ? List.from(values) : [];

  void dispose() {
    valueDraftController.dispose();
  }
}

class _WizardVariantImage {
  final String key;
  final String previewUrl;

  _WizardVariantImage({required this.key, required this.previewUrl});
}

class _WizardVariantRow {
  final String? id;
  String variantId;
  final TextEditingController nameController;
  final TextEditingController stockController;
  final TextEditingController priceController;
  final Map<String, String> options;
  final List<_WizardVariantImage> images;
  final bool hadImages;

  _WizardVariantRow({
    this.id,
    required this.variantId,
    String name = '',
    int stock = 10,
    double? price,
    Map<String, String>? options,
    List<_WizardVariantImage>? images,
    this.hadImages = false,
  })  : nameController = TextEditingController(text: name),
        stockController = TextEditingController(text: stock.toString()),
        priceController = TextEditingController(text: price != null ? price.toStringAsFixed(2) : ''),
        options = options != null ? Map.from(options) : {},
        images = images != null ? List.from(images) : [];

  void dispose() {
    nameController.dispose();
    stockController.dispose();
    priceController.dispose();
  }
}

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
  final _step1FormKey = GlobalKey<FormState>();
  final _scrollController = ScrollController();

  int _step = 1; // 1: Product & Options, 2: Variants & Shelf
  bool _isSaving = false;
  String? _errorMessage;

  // Step 1 Controllers & State
  late TextEditingController _nameController;
  late TextEditingController _priceController;
  late TextEditingController _skuController;
  late TextEditingController _descController;
  late TextEditingController _slugController;
  late TextEditingController _discountPercentController;
  late TextEditingController _tagsController;

  String _currency = 'BDT';
  bool _slugTouched = false;
  bool _hasDiscount = false;
  bool _showInStorefront = true;
  String? _selectedCategoryId;
  String? _selectedCustomerId;
  String? _paymentStrategyOverride; // null = use store default

  final List<_WizardOptionDraft> _options = [];

  // Step 2 State
  final List<_WizardVariantRow> _variants = [];

  bool get _isEditing => widget.product != null;

  @override
  void initState() {
    super.initState();
    final p = widget.product;

    _nameController = TextEditingController(text: p?.name ?? '');
    _priceController = TextEditingController(
      text: p != null && p.price > 0 ? p.price.toStringAsFixed(2) : '',
    );
    _currency = p != null && p.currency.isNotEmpty ? p.currency : 'BDT';
    _skuController = TextEditingController(text: p?.sku ?? '');
    _descController = TextEditingController(text: p?.description ?? '');
    _slugController = TextEditingController(text: p?.slug ?? '');
    _slugTouched = p?.slug != null && p!.slug!.isNotEmpty;

    _hasDiscount = p?.hasDiscount ?? false;
    _discountPercentController = TextEditingController(
      text: p != null && p.discountPercent > 0 ? p.discountPercent.toString() : '',
    );
    _tagsController = TextEditingController(text: (p?.tags ?? []).join(', '));
    _showInStorefront = p?.showInStorefront ?? true;
    _selectedCategoryId = p?.categoryId;
    _selectedCustomerId = p?.customerId;
    _paymentStrategyOverride = p?.paymentStrategyOverride;

    // Load initial options if present
    if (p != null && p.options.isNotEmpty) {
      for (final opt in p.options) {
        _options.add(_WizardOptionDraft(name: opt.name, values: opt.values));
      }
    }

    // Load initial variants
    if (p != null && p.variants.isNotEmpty) {
      for (final v in p.variants) {
        final shots = <_WizardVariantImage>[];
        final urls = v.imageUrls.isNotEmpty ? v.imageUrls : (v.imageUrl != null ? [v.imageUrl!] : <String>[]);
        final keys = v.imageKeys.isNotEmpty ? v.imageKeys : (v.imageKey != null ? [v.imageKey!] : <String>[]);

        for (int i = 0; i < urls.length; i++) {
          final k = i < keys.length ? keys[i] : urls[i];
          shots.add(_WizardVariantImage(key: k, previewUrl: urls[i]));
        }

        _variants.add(
          _WizardVariantRow(
            id: v.id.isNotEmpty ? v.id : null,
            variantId: v.shortId ?? makeVariantId(),
            name: v.name,
            stock: v.stock,
            price: v.price > 0 ? v.price : null,
            options: v.options,
            images: shots,
            hadImages: shots.isNotEmpty,
          ),
        );
      }
    } else {
      _variants.add(
        _WizardVariantRow(
          variantId: makeVariantId(),
          name: '',
          stock: 10,
        ),
      );
    }

    // Preload categories and customers in background
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProductsProvider>().fetchCategories(widget.businessId);
      context.read<CustomersProvider>().fetchCustomers(widget.businessId);
      if (_isEditing) {
        _loadProductDetails();
      }
    });
  }

  void _loadProductDetails() async {
    final prods = context.read<ProductsProvider>();
    final detailed = await prods.fetchProductDetail(widget.businessId, widget.product!.id);
    if (detailed != null && mounted) {
      setState(() {
        if (_options.isEmpty && detailed.options.isNotEmpty) {
          for (final opt in detailed.options) {
            _options.add(_WizardOptionDraft(name: opt.name, values: opt.values));
          }
        }

        if (_variants.length == 1 && _variants.first.id == null && detailed.variants.isNotEmpty) {
          _variants.first.dispose();
          _variants.clear();
          for (final v in detailed.variants) {
            final shots = <_WizardVariantImage>[];
            final urls = v.imageUrls.isNotEmpty ? v.imageUrls : (v.imageUrl != null ? [v.imageUrl!] : <String>[]);
            final keys = v.imageKeys.isNotEmpty ? v.imageKeys : (v.imageKey != null ? [v.imageKey!] : <String>[]);
            for (int i = 0; i < urls.length; i++) {
              final k = i < keys.length ? keys[i] : urls[i];
              shots.add(_WizardVariantImage(key: k, previewUrl: urls[i]));
            }
            _variants.add(
              _WizardVariantRow(
                id: v.id,
                variantId: v.shortId ?? makeVariantId(),
                name: v.name,
                stock: v.stock,
                price: v.price > 0 ? v.price : null,
                options: v.options,
                images: shots,
                hadImages: shots.isNotEmpty,
              ),
            );
          }
        }
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
    _skuController.dispose();
    _descController.dispose();
    _slugController.dispose();
    _discountPercentController.dispose();
    _tagsController.dispose();
    _scrollController.dispose();
    for (final opt in _options) {
      opt.dispose();
    }
    for (final v in _variants) {
      v.dispose();
    }
    super.dispose();
  }

  void _onNameChanged(String val) {
    if (!_slugTouched) {
      _slugController.text = slugify(val);
    }
  }

  void _addOption() {
    if (_options.length >= kMaxOptions) return;
    setState(() {
      _options.add(_WizardOptionDraft(name: ''));
    });
  }

  void _removeOption(int index) {
    setState(() {
      _options[index].dispose();
      _options.removeAt(index);
    });
  }

  void _addOptionValue(int optionIndex) {
    final opt = _options[optionIndex];
    final text = opt.valueDraftController.text.trim();
    if (text.isEmpty) return;

    if (!opt.values.any((v) => v.toLowerCase() == text.toLowerCase())) {
      if (opt.values.length < kMaxOptionValues) {
        setState(() {
          opt.values.add(text);
          opt.valueDraftController.clear();
        });
      }
    } else {
      opt.valueDraftController.clear();
    }
  }

  void _removeOptionValue(int optionIndex, int valueIndex) {
    setState(() {
      _options[optionIndex].values.removeAt(valueIndex);
    });
  }

  void _addVariantRow() {
    final prev = _variants.isNotEmpty ? _variants.last : null;
    final nextOptions = <String, String>{};
    if (prev != null && _options.isNotEmpty) {
      nextOptions.addAll(prev.options);
    }

    setState(() {
      _variants.add(
        _WizardVariantRow(
          variantId: makeVariantId(),
          name: '',
          stock: 10,
          price: double.tryParse(prev?.priceController.text ?? ''),
          options: nextOptions,
        ),
      );
    });
  }

  void _removeVariantRow(int index) {
    if (_variants.length <= 1) {
      showAppSnack('A product must contain at least one variant.');
      return;
    }
    setState(() {
      _variants[index].dispose();
      _variants.removeAt(index);
    });
  }

  void _removeVariantImage(int variantIndex, int imageIndex) {
    setState(() {
      _variants[variantIndex].images.removeAt(imageIndex);
    });
  }

  Future<void> _pickImagesForVariant(int variantIndex) async {
    final row = _variants[variantIndex];
    final remainingSlots = kMaxImagesPerVariant - row.images.length;
    if (remainingSlots <= 0) {
      showAppSnack('Maximum of $kMaxImagesPerVariant images per variant allowed.');
      return;
    }

    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pick from Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take a Photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
          ],
        ),
      ),
    );

    if (source == null) return;

    List<XFile> pickedList = [];
    if (source == ImageSource.gallery) {
      final multiple = await picker.pickMultiImage();
      if (multiple.isNotEmpty) {
        pickedList = multiple.take(remainingSlots).toList();
      }
    } else {
      final single = await picker.pickImage(source: ImageSource.camera);
      if (single != null) {
        pickedList = [single];
      }
    }

    if (pickedList.isEmpty || !mounted) return;

    // Launch web-like Variant Photo Editing Wizard
    await VariantPhotoDialog.show(
      context: context,
      businessId: widget.businessId,
      files: pickedList,
      variantId: row.variantId,
      onUploaded: (uploadedList) {
        setState(() {
          for (final u in uploadedList) {
            row.images.add(_WizardVariantImage(key: u.key, previewUrl: u.previewUrl));
          }
        });
      },
    );
  }

  Map<String, int> _getCombinationCounts() {
    final counts = <String, int>{};
    if (_options.isEmpty) return counts;

    for (final v in _variants) {
      final combo = _options.map((o) => v.options[o.name] ?? '').join(' / ');
      counts[combo] = (counts[combo] ?? 0) + 1;
    }
    return counts;
  }

  String? _validateStepOne() {
    final name = _nameController.text.trim();
    if (name.isEmpty) return 'The product needs a name.';

    final price = double.tryParse(_priceController.text.trim());
    if (price == null || price <= 0) return 'The product needs a default price above 0.';

    final sku = _skuController.text.trim();
    if (sku.isEmpty) return 'The product needs a SKU code.';

    if (_options.isNotEmpty) {
      for (int i = 0; i < _options.length; i++) {
        final opt = _options[i];
        if (opt.name.trim().isEmpty) return 'Option ${i + 1} needs a name (e.g. Color).';
        if (opt.values.isEmpty) return 'Option "${opt.name}" needs at least one value.';
      }
    }

    if (_hasDiscount) {
      final percent = double.tryParse(_discountPercentController.text.trim());
      if (percent == null || percent < 0 || percent > 100) {
        return 'The discount has to be between 0 and 100 percent.';
      }
    }

    return null;
  }

  String? _validateStepTwo() {
    if (_options.isNotEmpty) {
      for (int i = 0; i < _variants.length; i++) {
        final v = _variants[i];
        for (final opt in _options) {
          final chosen = v.options[opt.name];
          if (chosen == null || chosen.trim().isEmpty) {
            return 'Variant #${i + 1} must choose a ${opt.name}.';
          }
        }
      }

      final counts = _getCombinationCounts();
      for (final entry in counts.entries) {
        if (entry.value > 1) {
          return 'Two variants carry the same combination: ${entry.key.isEmpty ? "(empty)" : entry.key}';
        }
      }
    }
    return null;
  }

  void _goToStepTwo() {
    final problem = _validateStepOne();
    if (problem != null) {
      setState(() => _errorMessage = problem);
      showAppSnack(problem, isError: true);
      return;
    }
    setState(() {
      _errorMessage = null;
      _step = 2;
    });
    if (_scrollController.hasClients) {
      _scrollController.jumpTo(0);
    }
  }

  void _submit() async {
    final scope = _isEditing ? 'Edit product' : 'Add product';
    appDiagnostics.recordMessage(scope, 'Submit button tapped');

    final stepOneError = _validateStepOne();
    if (stepOneError != null) {
      setState(() {
        _step = 1;
        _errorMessage = stepOneError;
      });
      showAppSnack(stepOneError, isError: true);
      return;
    }

    final stepTwoError = _validateStepTwo();
    if (stepTwoError != null) {
      setState(() {
        _step = 2;
        _errorMessage = stepTwoError;
      });
      showAppSnack(stepTwoError, isError: true);
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    final price = double.tryParse(_priceController.text.trim()) ?? 0.0;
    final sku = _skuController.text.trim().isNotEmpty
        ? _skuController.text.trim()
        : 'SKU-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';
    final desc = _descController.text.trim();
    final slug = _slugController.text.trim();
    final discountPercent = _hasDiscount ? (double.tryParse(_discountPercentController.text.trim()) ?? 0.0) : 0.0;
    final tags = _tagsController.text
        .split(',')
        .map((t) => t.trim())
        .where((t) => t.isNotEmpty)
        .toList();

    // Prepare parsed options
    final optionsPayload = _options.map((o) => {'name': o.name.trim(), 'values': o.values}).toList();

    // Prepare parsed variants
    final variantsPayload = <Map<String, dynamic>>[];
    for (final v in _variants) {
      final rowPrice = double.tryParse(v.priceController.text.trim());
      final stock = int.tryParse(v.stockController.text.trim()) ?? 0;
      final combination = _options.map((o) => v.options[o.name] ?? '').join(' / ');
      final variantName = _options.isNotEmpty ? combination : (v.nameController.text.trim().isNotEmpty ? v.nameController.text.trim() : 'Default');
      final imgKeys = v.images.map((img) => img.key).toList();
      final imgUrls = v.images.map((img) => img.previewUrl).toList();

      final variantMap = <String, dynamic>{
        if (v.id != null && v.id!.isNotEmpty) 'id': v.id,
        'name': variantName,
        'stock': stock,
        if (rowPrice != null && rowPrice > 0) 'price': rowPrice,
        if (v.variantId.isNotEmpty) 'variantId': v.variantId,
        'isAvailable': true,
        if (imgUrls.isNotEmpty) 'imageUrl': imgUrls.first,
        if (imgUrls.isNotEmpty) 'imageUrls': imgUrls,
        if (imgKeys.isNotEmpty) 'imageKeys': imgKeys,
        if (v.hadImages && imgKeys.isEmpty) 'clearImage': true,
        if (_options.isNotEmpty)
          'options': Map<String, String>.fromEntries(
            _options.map((o) => MapEntry(o.name, v.options[o.name] ?? '')),
          ),
      };
      variantsPayload.add(variantMap);
    }

    final payload = <String, dynamic>{
      'name': _nameController.text.trim(),
      'price': price,
      'currency': _currency,
      'sku': sku,
      if (desc.isNotEmpty) 'description': desc,
      if (slug.isNotEmpty) 'slug': slug,
      if (_selectedCategoryId != null && _selectedCategoryId!.isNotEmpty)
        'categoryId': _selectedCategoryId,
      if (_selectedCustomerId != null && _selectedCustomerId!.isNotEmpty)
        'customerId': _selectedCustomerId,
      'hasDiscount': _hasDiscount,
      'discountPercent': discountPercent,
      'tags': tags,
      'showInStorefront': _showInStorefront,
      'paymentStrategyOverride': _paymentStrategyOverride,
      if (optionsPayload.isNotEmpty) 'options': optionsPayload,
      'variants': variantsPayload,
    };

    final prods = context.read<ProductsProvider>();
    bool ok = false;
    try {
      if (_isEditing) {
        ok = await prods.updateProduct(widget.businessId, widget.product!.id, payload);
      } else {
        ok = await prods.createProduct(widget.businessId, payload);
      }
    } catch (e, stack) {
      appDiagnostics.record('$scope submit error', e, stack);
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _errorMessage = e.toString();
      });
      showAppSnack('Save failed: $e', isError: true);
      return;
    }

    if (!mounted) return;
    setState(() => _isSaving = false);

    if (ok) {
      appDiagnostics.recordMessage(scope, _isEditing ? 'Product updated' : 'Product created');
      showAppSnack(_isEditing ? 'Product updated successfully' : 'Product created successfully');
      Navigator.pop(context);
    } else {
      final msg = prods.errorMessage ?? 'Failed to save product. Please check fields.';
      setState(() => _errorMessage = msg);
      showAppSnack(msg, isError: true);
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
        showAppSnack('Product removed from catalog');
        Navigator.pop(context);
      } else if (mounted) {
        showAppSnack(prods.errorMessage ?? 'Failed to delete product', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Product' : 'Add Product'),
        actions: [
          if (_isEditing)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
              onPressed: _delete,
            ),
        ],
      ),
      bottomNavigationBar: _buildBottomBar(),
      body: Column(
        children: [
          _buildStepBar(),
          if (_errorMessage != null)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: AppTheme.danger, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: ListView(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                if (_step == 1) _buildStepOneContent() else _buildStepTwoContent(),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepBar() {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(bottom: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _step = 1),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: _step == 1 ? AppTheme.primaryColor.withValues(alpha: 0.12) : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  border: _step == 1 ? Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.4)) : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircleAvatar(
                      radius: 10,
                      backgroundColor: _step == 1 ? AppTheme.primaryColor : Colors.grey.shade400,
                      child: const Text('1', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Product & Options',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: _step == 1 ? FontWeight.bold : FontWeight.normal,
                        color: _step == 1 ? AppTheme.primaryColor : Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: InkWell(
              onTap: _goToStepTwo,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: _step == 2 ? AppTheme.primaryColor.withValues(alpha: 0.12) : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  border: _step == 2 ? Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.4)) : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircleAvatar(
                      radius: 10,
                      backgroundColor: _step == 2 ? AppTheme.primaryColor : Colors.grey.shade400,
                      child: const Text('2', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Variants Shelf',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: _step == 2 ? FontWeight.bold : FontWeight.normal,
                        color: _step == 2 ? AppTheme.primaryColor : Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepOneContent() {
    final prods = context.watch<ProductsProvider>();
    final custs = context.watch<CustomersProvider>();
    final biz = context.watch<BusinessProvider>();
    final storeStrategy = biz.currentBusiness?.paymentStrategy ?? 'cod';

    return Form(
      key: _step1FormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Product Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(height: 14),

                // Name
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'Product Name *',
                    hintText: 'e.g. Silk Cotton Kurti',
                  ),
                  onChanged: _onNameChanged,
                ),
                const SizedBox(height: 14),

                // Price & Currency
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextFormField(
                        controller: _priceController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Default Price *',
                          hintText: '0.00',
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: DropdownButtonFormField<String>(
                        initialValue: _currency,
                        decoration: const InputDecoration(labelText: 'Currency'),
                        items: kSupportedCurrencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                        onChanged: (val) {
                          if (val != null) setState(() => _currency = val);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'What a variant without its own price override costs, quoted in this currency.',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 14),

                // SKU
                TextFormField(
                  controller: _skuController,
                  decoration: const InputDecoration(
                    labelText: 'SKU *',
                    hintText: 'e.g. KURTI-01',
                  ),
                ),
                const SizedBox(height: 14),

                // Description
                TextFormField(
                  controller: _descController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Optional product description, fabric details, sizing notes...',
                  ),
                ),
                const SizedBox(height: 16),

                // Discount Switch
                Row(
                  children: [
                    Switch(
                      value: _hasDiscount,
                      onChanged: (val) => setState(() => _hasDiscount = val),
                    ),
                    const SizedBox(width: 8),
                    const Text('This product has a discount', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  ],
                ),
                if (_hasDiscount) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      SizedBox(
                        width: 120,
                        child: TextFormField(
                          controller: _discountPercentController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(
                            labelText: 'Discount %',
                            hintText: '10',
                            suffixText: '%',
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '% off the default price for customers.',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),

                // Tags
                TextFormField(
                  controller: _tagsController,
                  decoration: const InputDecoration(
                    labelText: 'Tags',
                    hintText: 'saree, wedding, cotton — separated by commas',
                  ),
                ),
                const SizedBox(height: 4),
                Text('Comma-separated keywords for search and categorization.', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                const SizedBox(height: 14),

                // Category
                DropdownButtonFormField<String?>(
                  initialValue: _selectedCategoryId,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('No Category')),
                    ...prods.categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))),
                  ],
                  onChanged: (val) => setState(() => _selectedCategoryId = val),
                ),
                const SizedBox(height: 14),

                // Customer / Company link
                if (custs.allCustomers.isNotEmpty) ...[
                  DropdownButtonFormField<String?>(
                    initialValue: _selectedCustomerId,
                    decoration: const InputDecoration(labelText: 'Customer / Company Link'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('— No customer link —')),
                      ...custs.allCustomers.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))),
                    ],
                    onChanged: (val) => setState(() => _selectedCustomerId = val),
                  ),
                  const SizedBox(height: 14),
                ],

                // Show in storefront
                Row(
                  children: [
                    Switch(
                      value: _showInStorefront,
                      onChanged: (val) => setState(() => _showInStorefront = val),
                    ),
                    const SizedBox(width: 8),
                    const Text('Show in storefront', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  ],
                ),
                const SizedBox(height: 14),

                // Payment Strategy Override
                DropdownButtonFormField<String?>(
                  initialValue: _paymentStrategyOverride,
                  decoration: const InputDecoration(labelText: 'Payment Strategy Override'),
                  items: [
                    DropdownMenuItem(
                      value: null,
                      child: Text('Use store default — ${paymentStrategyLabel(storeStrategy)}'),
                    ),
                    ...kPaymentStrategyOptions.map(
                      (opt) => DropdownMenuItem(value: opt.value, child: Text(opt.label)),
                    ),
                  ],
                  onChanged: (val) => setState(() => _paymentStrategyOverride = val),
                ),
                const SizedBox(height: 4),
                Text(
                  _paymentStrategyOverride != null
                      ? paymentStrategyDescription(_paymentStrategyOverride)
                      : 'Follows store default: ${paymentStrategyDescription(storeStrategy)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 14),

                // URL slug
                TextFormField(
                  controller: _slugController,
                  decoration: const InputDecoration(
                    labelText: 'URL Slug',
                    hintText: 'auto-generated from product title',
                  ),
                  onChanged: (val) => _slugTouched = true,
                ),
                const SizedBox(height: 4),
                Text('Storefront address: /store/<slug>', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Options Builder Card
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Options', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    if (_options.length < kMaxOptions)
                      TextButton.icon(
                        onPressed: _addOption,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add option'),
                      )
                    else
                      Text(
                        '$kMaxOptions of $kMaxOptions',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'The ways this product varies — Color, Size, Material. Up to $kMaxOptions. Optional: without any, step two is a plain list of variants.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
                ),
                const SizedBox(height: 12),

                if (_options.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'No options declared. Every variant in step two will be a free-named row with its own stock and photo.',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  )
                else
                  ..._options.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final opt = entry.value;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey.withValues(alpha: 0.25)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  initialValue: opt.name,
                                  decoration: InputDecoration(
                                    labelText: 'Option ${idx + 1} Name',
                                    hintText: idx == 0 ? 'Color' : idx == 1 ? 'Size' : 'Material',
                                    isDense: true,
                                  ),
                                  onChanged: (val) => opt.name = val,
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: AppTheme.danger, size: 20),
                                onPressed: () => _removeOption(idx),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),

                          // Option values chips
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              ...opt.values.asMap().entries.map((vEntry) {
                                final vIdx = vEntry.key;
                                final valStr = vEntry.value;
                                return Chip(
                                  label: Text(valStr, style: const TextStyle(fontSize: 12)),
                                  deleteIcon: const Icon(Icons.close, size: 14),
                                  onDeleted: () => _removeOptionValue(idx, vIdx),
                                  visualDensity: VisualDensity.compact,
                                );
                              }),
                              // Add value inline field
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SizedBox(
                                    width: 130,
                                    child: TextField(
                                      controller: opt.valueDraftController,
                                      decoration: InputDecoration(
                                        hintText: opt.values.isEmpty ? 'e.g. Red' : 'Add value...',
                                        isDense: true,
                                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                      ),
                                      onSubmitted: (_) => _addOptionValue(idx),
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  IconButton(
                                    icon: const Icon(Icons.add_circle, color: AppTheme.primaryColor),
                                    onPressed: () => _addOptionValue(idx),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepTwoContent() {
    final hasOptions = _options.isNotEmpty;
    final counts = _getCombinationCounts();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Variants Shelf', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 6),
              Text(
                hasOptions
                    ? 'Every variant answers every option declared in step one — that combination is the row. Each row carries its own pictures, an optional price override (default price otherwise) and stock count. The short ID is rolled for you and never editable.'
                    : 'Add as many variants as you need. A variant holds up to $kMaxImagesPerVariant pictures and the first is the cover on the shelf. Each picture is stamped with the variant short ID before storage so incoming customer photos can be read directly.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // List of variant cards
        ..._variants.asMap().entries.map((entry) {
          final i = entry.key;
          final v = entry.value;
          final combo = _options.map((o) => v.options[o.name] ?? '').join(' / ');
          final isDuplicate = hasOptions && (counts[combo] ?? 0) > 1;

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isDuplicate ? AppTheme.danger : Colors.grey.withValues(alpha: 0.25),
                width: isDuplicate ? 1.5 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Variant card header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Variant #${i + 1}',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '#${v.variantId}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.bold,
                              fontSize: 11,
                              color: AppTheme.primaryColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: AppTheme.danger, size: 20),
                      onPressed: () => _removeVariantRow(i),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                if (hasOptions) ...[
                  // Dropdowns for each declared option
                  ..._options.map((opt) {
                    final currentVal = v.options[opt.name];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: DropdownButtonFormField<String>(
                        initialValue: opt.values.contains(currentVal) ? currentVal : null,
                        decoration: InputDecoration(
                          labelText: 'Choose ${opt.name}',
                          isDense: true,
                        ),
                        items: opt.values
                            .map((val) => DropdownMenuItem(value: val, child: Text(val)))
                            .toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() {
                              v.options[opt.name] = val;
                            });
                          }
                        },
                      ),
                    );
                  }),
                ] else ...[
                  // Free-form name input
                  TextFormField(
                    controller: v.nameController,
                    decoration: const InputDecoration(
                      labelText: 'Variant Name',
                      hintText: 'e.g. Standard, Red, Large',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 10),
                ],

                if (isDuplicate)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'Another variant already has this exact combination — change a value or delete this row.',
                      style: TextStyle(color: AppTheme.danger, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),

                // Stock & Price override row
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: v.stockController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Stock Units',
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: v.priceController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Price Override',
                          hintText: 'Default price',
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Images Section
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Photos (${v.images.length}/$kMaxImagesPerVariant)',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    OutlinedButton.icon(
                      onPressed: v.images.length < kMaxImagesPerVariant ? () => _pickImagesForVariant(i) : null,
                      icon: const Icon(Icons.add_photo_alternate_outlined, size: 16),
                      label: Text(v.images.isEmpty ? 'Upload photos' : 'Add more'),
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        side: BorderSide(color: AppTheme.primaryColor.withValues(alpha: 0.5)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                if (v.images.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.withValues(alpha: 0.15), style: BorderStyle.solid),
                    ),
                    child: Center(
                      child: Text(
                        'No photos uploaded for this variant yet.',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: v.images.asMap().entries.map((imgEntry) {
                      final imgIdx = imgEntry.key;
                      final img = imgEntry.value;

                      return Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: 76,
                              height: 76,
                              color: Colors.grey.withValues(alpha: 0.1),
                              child: Image.network(
                                img.previewUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(Icons.image_not_supported, size: 24, color: Colors.grey),
                                ),
                              ),
                            ),
                          ),
                          if (imgIdx == 0)
                            Positioned(
                              left: 4,
                              top: 4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.75),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  'Cover',
                                  style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                          Positioned(
                            right: 2,
                            top: 2,
                            child: InkWell(
                              onTap: () => _removeVariantImage(i, imgIdx),
                              child: Container(
                                padding: const EdgeInsets.all(3),
                                decoration: const BoxDecoration(
                                  color: Colors.black54,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.close, size: 12, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
              ],
            ),
          );
        }),

        // Add variant button
        OutlinedButton.icon(
          onPressed: _addVariantRow,
          icon: const Icon(Icons.add),
          label: const Text('+ Add another variant'),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            side: BorderSide(color: AppTheme.primaryColor.withValues(alpha: 0.4)),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
      ),
      child: SafeArea(
        child: Row(
          children: [
            OutlinedButton(
              onPressed: _isSaving ? null : () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            const Spacer(),
            if (_step == 1)
              ElevatedButton(
                onPressed: _goToStepTwo,
                child: const Text('Next: variants →'),
              )
            else ...[
              OutlinedButton(
                onPressed: _isSaving ? null : () => setState(() => _step = 1),
                child: const Text('← Back to product'),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _isSaving ? null : _submit,
                child: _isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : Text(_isEditing ? 'Save changes' : 'Create product'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
