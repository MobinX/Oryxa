import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/order.dart';
import '../services/api_service.dart';

class OrdersProvider extends ChangeNotifier {
  final ApiService apiService;

  List<OrderModel> _orders = [];
  String _activeTab = 'all'; // 'all', 'pending', 'acknowledged', 'onDelivery', 'done'
  String _searchQuery = '';
  bool _isLoading = false;
  String? _errorMessage;

  OrdersProvider({required this.apiService});

  List<OrderModel> get orders {
    return _orders.where((o) {
      if (_activeTab != 'all' && o.state != _activeTab) return false;
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final c = o.customerName.toLowerCase();
        final p = (o.customerPhone ?? '').toLowerCase();
        final no = o.shortOrderNumber.toLowerCase();
        final prod = (o.productName ?? '').toLowerCase();
        if (!c.contains(q) && !p.contains(q) && !no.contains(q) && !prod.contains(q)) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  List<OrderModel> get allOrders => _orders;
  String get activeTab => _activeTab;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  // KPI Calculations
  int get totalOrdersCount => _orders.length;
  int get pendingCount => _orders.where((o) => o.state == 'pending').length;
  int get acknowledgedCount => _orders.where((o) => o.state == 'acknowledged').length;
  int get onDeliveryCount => _orders.where((o) => o.state == 'onDelivery').length;
  int get deliveredCount => _orders.where((o) => o.state == 'done').length;
  double get totalRevenue => _orders
      .where((o) => o.state != 'cancelled')
      .fold(0.0, (sum, o) => sum + o.totalPrice);

  void setActiveTab(String tab) {
    _activeTab = tab;
    notifyListeners();
  }

  void setSearchQuery(String q) {
    _searchQuery = q;
    notifyListeners();
  }

  Future<void> fetchOrders(String businessId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathOrders(businessId, limit: 100));
      if (res is List) {
        _orders = res.map((o) => OrderModel.fromJson(o as Map<String, dynamic>)).toList();
      }
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
    }
  }

  Future<bool> updateOrderState(String businessId, String orderId, String newState) async {
    try {
      await apiService.patch(
        ApiConfig.pathOrderState(businessId, orderId),
        body: {'state': newState},
      );

      final idx = _orders.indexWhere((o) => o.id == orderId);
      if (idx != -1) {
        _orders[idx] = _orders[idx].copyWith(state: newState);
      }
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> advanceOrder(String businessId, OrderModel order) async {
    final next = order.nextState;
    if (next == null) return false;
    return updateOrderState(businessId, order.id, next);
  }

  Future<bool> revertOrder(String businessId, OrderModel order) async {
    final prev = order.prevState;
    if (prev == null) return false;
    return updateOrderState(businessId, order.id, prev);
  }

  Future<bool> createOrder(String businessId, Map<String, dynamic> payload) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await apiService.post(
        ApiConfig.pathOrders(businessId),
        body: payload,
      );
      await fetchOrders(businessId);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateOrderDetails(String businessId, String orderId, Map<String, dynamic> data) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await apiService.patch(
        ApiConfig.pathOrderDetail(businessId, orderId),
        body: data,
      );
      await fetchOrders(businessId);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<OrderModel?> fetchOrderDetail(String businessId, String orderId) async {
    try {
      final res = await apiService.get(ApiConfig.pathOrderDetail(businessId, orderId));
      if (res is Map<String, dynamic>) {
        return OrderModel.fromJson(res);
      }
    } catch (e) {
      debugPrint('[OrdersProvider] fetchOrderDetail error: $e');
    }
    return null;
  }

  Future<bool> deleteOrder(String businessId, String orderId) async {
    try {
      await apiService.delete(ApiConfig.pathOrderDetail(businessId, orderId));
      _orders.removeWhere((o) => o.id == orderId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }
}
