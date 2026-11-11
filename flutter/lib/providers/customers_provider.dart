import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/customer.dart';
import '../services/api_service.dart';

class CustomersProvider extends ChangeNotifier {
  final ApiService apiService;

  List<CustomerModel> _customers = [];
  String _searchQuery = '';
  bool _isLoading = false;
  String? _errorMessage;

  CustomersProvider({required this.apiService});

  List<CustomerModel> get customers {
    if (_searchQuery.isEmpty) return _customers;
    final q = _searchQuery.toLowerCase();
    return _customers.where((c) {
      final n = c.name.toLowerCase();
      final p = (c.phone ?? '').toLowerCase();
      final e = (c.email ?? '').toLowerCase();
      return n.contains(q) || p.contains(q) || e.contains(q);
    }).toList();
  }

  List<CustomerModel> get allCustomers => _customers;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  void setSearchQuery(String q) {
    _searchQuery = q.trim();
    notifyListeners();
  }

  Future<void> fetchCustomers(String businessId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathCustomers(businessId, limit: 100));
      if (res is Map && res['customers'] is List) {
        _customers = (res['customers'] as List)
            .map((c) => CustomerModel.fromJson(c as Map<String, dynamic>))
            .toList();
      } else if (res is List) {
        _customers = res.map((c) => CustomerModel.fromJson(c as Map<String, dynamic>)).toList();
      }
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
    }
  }

  Future<bool> createCustomer(String businessId, Map<String, dynamic> payload) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await apiService.post(
        ApiConfig.pathCustomers(businessId),
        body: payload,
      );
      await fetchCustomers(businessId);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateCustomer(String businessId, String customerId, Map<String, dynamic> payload) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await apiService.put(
        ApiConfig.pathCustomerDetail(businessId, customerId),
        body: payload,
      );
      await fetchCustomers(businessId);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteCustomer(String businessId, String customerId) async {
    try {
      await apiService.delete(ApiConfig.pathCustomerDetail(businessId, customerId));
      _customers.removeWhere((c) => c.id == customerId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<CustomerModel?> fetchCustomerDetail(String businessId, String customerId) async {
    try {
      final res = await apiService.get(ApiConfig.pathCustomerDetail(businessId, customerId));
      if (res is Map<String, dynamic>) {
        if (res['customer'] is Map<String, dynamic>) {
          return CustomerModel.fromJson(res['customer']);
        }
        return CustomerModel.fromJson(res);
      }
    } catch (e) {
      debugPrint('[CustomersProvider] fetchCustomerDetail error: $e');
    }
    return null;
  }
}
