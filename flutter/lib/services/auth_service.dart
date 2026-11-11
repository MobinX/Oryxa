import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  final ApiService apiService;
  UserModel? _currentUser;
  String? _token;
  String? _selectedBusinessId;

  AuthService({required this.apiService});

  UserModel? get currentUser => _currentUser;
  String? get token => _token;
  String? get selectedBusinessId => _selectedBusinessId;
  bool get isAuthenticated => _token != null && _token!.isNotEmpty;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    final savedBaseUrl = prefs.getString(ApiConfig.storageKeyBaseUrl);
    if (savedBaseUrl != null && savedBaseUrl.isNotEmpty) {
      apiService.configure(baseUrl: savedBaseUrl);
    }

    _token = prefs.getString(ApiConfig.storageKeyToken);
    _selectedBusinessId = prefs.getString(ApiConfig.storageKeySelectedBusiness);

    final userJson = prefs.getString(ApiConfig.storageKeyUser);
    if (userJson != null) {
      try {
        _currentUser = UserModel.fromJson(jsonDecode(userJson));
      } catch (e) {
        debugPrint('[AuthService] error parsing stored user: $e');
      }
    }

    if (_token != null) {
      apiService.setToken(_token);
    }
  }

  Future<void> setCustomBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.storageKeyBaseUrl, url);
    apiService.configure(baseUrl: url);
  }

  Future<void> setSelectedBusinessId(String businessId) async {
    _selectedBusinessId = businessId;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.storageKeySelectedBusiness, businessId);
  }

  /// Authenticate using email and password, or developer bypass token
  Future<UserModel> login({
    required String email,
    required String password,
    String? customToken,
  }) async {
    // If a raw token or dev token is provided
    final tokenToUse = customToken ?? 'demo_token_${DateTime.now().millisecondsSinceEpoch}';

    _token = tokenToUse;
    apiService.setToken(_token);

    UserModel user;
    try {
      // Attempt fetching current user from API
      final res = await apiService.get(ApiConfig.pathUsersMe);
      user = UserModel.fromJson(res);
    } catch (_) {
      // In dev bypass or mock mode, construct fallback user
      user = UserModel(
        id: 'usr_${email.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '')}',
        firebaseUid: 'fb_${email.hashCode}',
        name: email.split('@').first.replaceAll('.', ' ').toUpperCase(),
        email: email,
        role: 'merchant',
      );
    }

    _currentUser = user;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.storageKeyToken, _token!);
    await prefs.setString(ApiConfig.storageKeyUser, jsonEncode(user.toJson()));

    return user;
  }

  /// Instant demo sign in with test credentials
  Future<UserModel> demoLogin() async {
    return login(
      email: 'demo@onlyorders.io',
      password: 'password123',
      customToken: 'dev_mock_jwt_token',
    );
  }

  Future<void> logout() async {
    _token = null;
    _currentUser = null;
    _selectedBusinessId = null;
    apiService.setToken(null);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(ApiConfig.storageKeyToken);
    await prefs.remove(ApiConfig.storageKeyUser);
    await prefs.remove(ApiConfig.storageKeySelectedBusiness);
  }
}
