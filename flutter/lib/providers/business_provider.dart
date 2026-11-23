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
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
    }
  }

  void setCurrentBusiness(BusinessModel business) {
    _currentBusiness = business;
    notifyListeners();
    loadActiveBusinessData();
  }

  Future<T?> _safeLoad<T>(String label, Future<T?> Function() load) async {
    try {
      return await load();
    } catch (e) {
      debugPrint('[BusinessProvider] $label error: $e');
      return null;
    }
  }

  Future<void> loadActiveBusinessData() async {
    if (_currentBusiness == null) return;
    final bId = _currentBusiness!.id;

    // These three reads are independent. Running them in parallel cuts the
    // startup/dashboard wait from three round trips to one.
    final results = await Future.wait<Object?>([
      _safeLoad<Map<String, dynamic>>('fetch stats', () async {
        final res = await apiService.get(ApiConfig.pathBusinessStats(bId));
        return res is Map<String, dynamic> ? res : null;
      }),
      _safeLoad<List>('fetch channels', () async {
        final res = await apiService.get(ApiConfig.pathChannels(bId));
        return res is List ? res : null;
      }),
      _safeLoad<Map<String, dynamic>>('fetch notifications', () async {
        final res = await apiService.get(ApiConfig.pathNotifications(bId));
        return res is Map<String, dynamic> ? res : null;
      }),
    ]);

    final statsRes = results[0] as Map<String, dynamic>?;
    final chRes = results[1] as List?;
    final notifRes = results[2] as Map<String, dynamic>?;

    if (statsRes != null) _stats = BusinessStats.fromJson(statsRes);
    if (chRes != null) {
      _channels = chRes
          .whereType<Map>()
          .map((c) => ChannelModel.fromJson(Map<String, dynamic>.from(c)))
          .toList();
    }
    if (notifRes != null && notifRes['notifications'] is List) {
      _notifications = (notifRes['notifications'] as List)
          .map((n) => NotificationItemModel.fromJson(Map<String, dynamic>.from(n as Map)))
          .toList();
      _unreadNotificationsCount = (notifRes['unreadCount'] as num?)?.toInt() ?? 0;
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
      _errorMessage = apiErrorMessage(e);
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
      _errorMessage = apiErrorMessage(e);
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
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> updatePaymentDeliverySettings({
    required List<DeliveryZoneModel> deliveryZones,
    required List<PaymentMethodModel> paymentMethods,
    required String paymentStrategy,
  }) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;
    try {
      await apiService.put(
        ApiConfig.pathBusiness(bId),
        body: {
          'deliveryZones': deliveryZones.map((z) => {'label': z.label, 'price': z.price}).toList(),
          'paymentMethods': paymentMethods.map((m) => {
                'name': m.name,
                if (m.info != null) 'info': m.info,
                'requiresTransactionId': m.requiresTransactionId,
              }).toList(),
          'paymentStrategy': paymentStrategy,
        },
      );
      _currentBusiness = _currentBusiness!.copyWith(
        deliveryZones: deliveryZones,
        paymentMethods: paymentMethods,
        paymentStrategy: paymentStrategy,
      );
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteChannel(String channelId) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;
    try {
      await apiService.delete(ApiConfig.pathChannelDetail(bId, channelId));
      _channels.removeWhere((c) => c.id == channelId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
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
        body: {
          'storeTheme': {'structure': theme},
        },
      );
      _currentBusiness = _currentBusiness!.copyWith(storeTheme: theme);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  // -------------------------------------------------------------
  // NOTIFICATIONS & MESSENGER PORTAL
  // -------------------------------------------------------------

  Future<void> fetchNotifications({bool unreadOnly = false}) async {
    if (_currentBusiness == null) return;
    final bId = _currentBusiness!.id;

    try {
      final notifRes = await apiService.get(ApiConfig.pathNotifications(bId, unread: unreadOnly));
      if (notifRes is Map && notifRes['notifications'] is List) {
        _notifications = (notifRes['notifications'] as List)
            .map((n) => NotificationItemModel.fromJson(n as Map<String, dynamic>))
            .toList();
        _unreadNotificationsCount = (notifRes['unreadCount'] as num?)?.toInt() ?? 0;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[BusinessProvider] fetch notifications error: $e');
    }
  }

  Future<bool> markAllNotificationsRead() async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;

    try {
      await apiService.post(
        ApiConfig.pathNotificationsRead(bId),
        body: {'all': true},
      );
      final now = DateTime.now();
      _notifications = _notifications.map((n) => n.copyWith(readAt: n.readAt ?? now)).toList();
      _unreadNotificationsCount = 0;
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[BusinessProvider] markAllNotificationsRead error: $e');
      return false;
    }
  }

  Future<bool> markNotificationRead(String id) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;

    try {
      await apiService.post(
        ApiConfig.pathNotificationsRead(bId),
        body: {
          'ids': [id]
        },
      );
      final now = DateTime.now();
      _notifications = _notifications.map((n) => n.id == id ? n.copyWith(readAt: now) : n).toList();
      if (_unreadNotificationsCount > 0) {
        _unreadNotificationsCount--;
      }
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[BusinessProvider] markNotificationRead error: $e');
      return false;
    }
  }

  Future<PushTestResult> sendTestPush() async {
    if (_currentBusiness == null) {
      return PushTestResult(tokens: 0, sent: 0, failed: 0, removed: 0, error: 'No active business selected');
    }
    final bId = _currentBusiness!.id;

    try {
      final res = await apiService.post(ApiConfig.pathPushTest(bId));
      if (res is Map<String, dynamic>) {
        return PushTestResult.fromJson(res);
      }
      return PushTestResult(tokens: 0, sent: 0, failed: 0, removed: 0, error: 'Unexpected response format');
    } catch (e) {
      return PushTestResult(tokens: 0, sent: 0, failed: 0, removed: 0, error: apiErrorMessage(e));
    }
  }

  Future<MessengerOverview> fetchMessengerOverview() async {
    if (_currentBusiness == null) {
      return MessengerOverview(users: []);
    }
    final bId = _currentBusiness!.id;

    try {
      final res = await apiService.get(ApiConfig.pathMessengerNotifications(bId));
      if (res is Map<String, dynamic>) {
        return MessengerOverview.fromJson(res);
      }
      return MessengerOverview(users: []);
    } catch (e) {
      debugPrint('[BusinessProvider] fetchMessengerOverview error: $e');
      return MessengerOverview(users: []);
    }
  }

  Future<String?> createMessengerCode() async {
    if (_currentBusiness == null) return null;
    final bId = _currentBusiness!.id;

    try {
      final res = await apiService.post(ApiConfig.pathMessengerNotifications(bId));
      if (res is Map && res['code'] != null) {
        return res['code'].toString();
      }
      return null;
    } catch (e) {
      debugPrint('[BusinessProvider] createMessengerCode error: $e');
      return null;
    }
  }

  Future<bool> removeMessengerFollower(String userId) async {
    if (_currentBusiness == null) return false;
    final bId = _currentBusiness!.id;

    try {
      await apiService.delete(ApiConfig.pathMessengerNotificationUser(bId, userId));
      return true;
    } catch (e) {
      debugPrint('[BusinessProvider] removeMessengerFollower error: $e');
      return false;
    }
  }
}
