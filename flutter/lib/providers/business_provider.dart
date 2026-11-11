import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/business.dart';
import '../models/channel.dart';
import '../models/notification_item.dart';
import '../services/api_service.dart';

class BusinessProvider extends ChangeNotifier {
  final ApiService apiService;

  List<BusinessModel> _businesses = [];
  BusinessModel? _currentBusiness;
  BusinessStats _stats = BusinessStats();
  List<ChannelModel> _channels = [];
  List<NotificationItemModel> _notifications = [];
  int _unreadNotificationsCount = 0;

  bool _isLoading = false;
  bool _isTogglingKillSwitch = false;
  String? _errorMessage;

  BusinessProvider({required this.apiService});

  List<BusinessModel> get businesses => _businesses;
  BusinessModel? get currentBusiness => _currentBusiness;
  BusinessStats get stats => _stats;
  List<ChannelModel> get channels => _channels;
  List<NotificationItemModel> get notifications => _notifications;
  int get unreadNotificationsCount => _unreadNotificationsCount;
  bool get isLoading => _isLoading;
  bool get isTogglingKillSwitch => _isTogglingKillSwitch;
  String? get errorMessage => _errorMessage;

  Future<void> fetchBusinesses({String? preferredBusinessId}) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathBusinesses);
      if (res is Map && res['businesses'] is List) {
        _businesses = (res['businesses'] as List)
            .map((b) => BusinessModel.fromJson(b as Map<String, dynamic>))
            .toList();
      }

      if (_businesses.isNotEmpty) {
        if (preferredBusinessId != null) {
          _currentBusiness = _businesses.firstWhere(
            (b) => b.id == preferredBusinessId,
            orElse: () => _businesses.first,
          );
        } else {
          _currentBusiness ??= _businesses.first;
        }

        // Fetch stats and channels for current business
        await loadActiveBusinessData();
      }
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
    }
  }

  void setCurrentBusiness(BusinessModel business) {
    _currentBusiness = business;
    notifyListeners();
    loadActiveBusinessData();
  }

  Future<void> loadActiveBusinessData() async {
    if (_currentBusiness == null) return;
    final bId = _currentBusiness!.id;

    // Load stats
    try {
      final statsRes = await apiService.get(ApiConfig.pathBusinessStats(bId));
      if (statsRes is Map<String, dynamic>) {
        _stats = BusinessStats.fromJson(statsRes);
      }
    } catch (e) {
      debugPrint('[BusinessProvider] fetch stats error: $e');
    }

    // Load channels
    try {
      final chRes = await apiService.get(ApiConfig.pathChannels(bId));
      if (chRes is List) {
        _channels = chRes
            .map((c) => ChannelModel.fromJson(c as Map<String, dynamic>))
            .toList();
      }
    } catch (e) {
      debugPrint('[BusinessProvider] fetch channels error: $e');
    }

    // Load notifications
    try {
      final notifRes = await apiService.get(ApiConfig.pathNotifications(bId));
      if (notifRes is Map && notifRes['notifications'] is List) {
        _notifications = (notifRes['notifications'] as List)
            .map((n) => NotificationItemModel.fromJson(n as Map<String, dynamic>))
            .toList();
        _unreadNotificationsCount = (notifRes['unreadCount'] as num?)?.toInt() ?? 0;
      }
    } catch (e) {
      debugPrint('[BusinessProvider] fetch notifications error: $e');
    }

    notifyListeners();
  }

  /// Global AI Agent Kill Switch: Master toggle across the entire store
  Future<bool> toggleAgentKillSwitch() async {
    if (_currentBusiness == null || _isTogglingKillSwitch) return false;
    final bId = _currentBusiness!.id;
    final nextState = !_currentBusiness!.agentState;

    _isTogglingKillSwitch = true;
    notifyListeners();

    try {
      await apiService.put(
        ApiConfig.pathBusiness(bId),
        body: {'agentState': nextState},
      );
      _currentBusiness = _currentBusiness!.copyWith(agentState: nextState);
      _isTogglingKillSwitch = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isTogglingKillSwitch = false;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> createBusiness(String name, {String? description}) async {
    _isLoading = true;
    notifyListeners();

    try {
      final res = await apiService.post(
        ApiConfig.pathBusinesses,
        body: {'name': name, 'description': description},
      );
      if (res is Map && res['id'] != null) {
        await fetchBusinesses(preferredBusinessId: res['id'].toString());
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateBusinessSettings({
    required String name,
    String? description,
    String? phone,
    String? email,
    String? address,
    String? agentProductGuidance,
    String? agentBargainGuidance,
  }) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;

    try {
      final payload = <String, dynamic>{
        'name': name,
        if (description != null) 'description': description,
        if (phone != null) 'phone': phone,
        if (email != null) 'email': email,
        if (address != null) 'address': address,
        if (agentProductGuidance != null) 'agentProductGuidance': agentProductGuidance,
        if (agentBargainGuidance != null) 'agentBargainGuidance': agentBargainGuidance,
      };

      await apiService.put(
        ApiConfig.pathBusiness(bId),
        body: payload,
      );
      _currentBusiness = _currentBusiness!.copyWith(
        name: name,
        description: description,
        phone: phone,
        email: email,
        address: address,
        agentProductGuidance: agentProductGuidance,
        agentBargainGuidance: agentBargainGuidance,
      );
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateStoreTheme(String theme) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;

    try {
      await apiService.put(
        ApiConfig.pathBusiness(bId),
        body: {'storeTheme': theme},
      );
      _currentBusiness = _currentBusiness!.copyWith(storeTheme: theme);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }
}
