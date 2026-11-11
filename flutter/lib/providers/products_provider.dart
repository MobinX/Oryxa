import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/product.dart';
import '../services/api_service.dart';

class ProductsProvider extends ChangeNotifier {
  final ApiService apiService;

  List<ProductModel> _products = [];
  List<CategoryModel> _categories = [];
  String? _selectedCategoryId;
  String _searchQuery = '';
  bool _isLoading = false;
  String? _errorMessage;

  ProductsProvider({required this.apiService});

  List<ProductModel> get products {
    return _products.where((p) {
      if (_selectedCategoryId != null && _selectedCategoryId!.isNotEmpty) {
        if (p.categoryId != _selectedCategoryId) return false;
      }
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final name = p.name.toLowerCase();
        final sku = (p.sku ?? '').toLowerCase();
        final cat = (p.categoryName ?? '').toLowerCase();
        if (!name.contains(q) && !sku.contains(q) && !cat.contains(q)) return false;
      }
      return true;
    }).toList();
  }

  List<CategoryModel> get categories => _categories;
  String? get selectedCategoryId => _selectedCategoryId;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  void setCategoryFilter(String? categoryId) {
    _selectedCategoryId = categoryId;
    notifyListeners();
  }

  void setSearchQuery(String q) {
    _searchQuery = q;
    notifyListeners();
  }

  Future<void> fetchProducts(String businessId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathProducts(businessId, limit: 100));
      if (res is Map && res['products'] is List) {
        _products = (res['products'] as List)
            .map((p) => ProductModel.fromJson(p as Map<String, dynamic>))
            .toList();
      } else if (res is List) {
        _products = res.map((p) => ProductModel.fromJson(p as Map<String, dynamic>)).toList();
      }

      await fetchCategories(businessId);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
    }
  }

  Future<void> fetchCategories(String businessId) async {
    try {
      final res = await apiService.get(ApiConfig.pathCategories(businessId));
      if (res is List) {
        _categories = res.map((c) => CategoryModel.fromJson(c as Map<String, dynamic>)).toList();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[ProductsProvider] fetchCategories error: $e');
    }
  }

  Future<bool> createProduct(String businessId, Map<String, dynamic> payload) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.post(
        ApiConfig.pathProducts(businessId),
        body: payload,
      );
      await fetchProducts(businessId);
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateProduct(String businessId, String productId, Map<String, dynamic> payload) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.put(
        ApiConfig.pathProductDetail(businessId, productId),
        body: payload,
      );
      await fetchProducts(businessId);
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteProduct(String businessId, String productId) async {
    try {
      await apiService.delete(ApiConfig.pathProductDetail(businessId, productId));
      _products.removeWhere((p) => p.id == productId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<ProductModel?> fetchProductDetail(String businessId, String productId) async {
    try {
      final res = await apiService.get(ApiConfig.pathProductDetail(businessId, productId));
      if (res is Map<String, dynamic>) {
        return ProductModel.fromJson(res);
      }
    } catch (e) {
      debugPrint('[ProductsProvider] fetchProductDetail error: $e');
    }
    return null;
  }

  Future<bool> createCategory(String businessId, String name) async {
    try {
      final res = await apiService.post(
        ApiConfig.pathCategories(businessId),
        body: {'name': name},
      );
      if (res is Map<String, dynamic>) {
        _categories.add(CategoryModel.fromJson(res));
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateCategory(String businessId, String categoryId, String name) async {
    try {
      await apiService.put(
        ApiConfig.pathCategoryDetail(businessId, categoryId),
        body: {'name': name},
      );
      await fetchCategories(businessId);
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteCategory(String businessId, String categoryId) async {
    try {
      await apiService.delete(ApiConfig.pathCategoryDetail(businessId, categoryId));
      _categories.removeWhere((c) => c.id == categoryId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }
}
