import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/user.dart';
import '../services/auth_exception.dart';
import '../services/diagnostics_service.dart';
import '../services/google_auth_service.dart';
import 'api_service.dart';

class AuthService extends ChangeNotifier {
  static const String _identityToolkitBase = 'https://identitytoolkit.googleapis.com/v1';
  static const String _secureTokenUrl = 'https://securetoken.googleapis.com/v1/token';

  /// Optional build-time key for local runs (`--dart-define=FIREBASE_API_KEY=...`).
  /// Release builds get the key from the dashboard's public mobile config route.
  static const String _envApiKey = String.fromEnvironment('FIREBASE_API_KEY');

  final ApiService apiService;
  final GoogleAuthService _googleAuth;
  UserModel? _currentUser;
  String? _token;
  String? _refreshToken;
  DateTime? _tokenExpiry;
  String? _selectedBusinessId;
  String? _firebaseApiKey;
  Future<String?>? _refreshInFlight;

  AuthService({required this.apiService})
      : _googleAuth = GoogleAuthService(apiBaseUrl: apiService.baseUrl) {
    // Firebase ID tokens live one hour. When the API answers 401, swap in a fresh token
    // and retry instead of leaving the merchant on a screen that silently stops working.
    apiService.setTokenRefresher(_refreshIdToken);
    _googleAuth.onUnhandledResult = (result) {
      unawaited(_applyGoogleResult(result));
    };
  }

  UserModel? get currentUser => _currentUser;
  String? get token => _token;
  String? get selectedBusinessId => _selectedBusinessId;
  bool get isAuthenticated => _token != null && _token!.isNotEmpty;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    final savedBaseUrl = prefs.getString(ApiConfig.storageKeyBaseUrl);
    if (savedBaseUrl != null && savedBaseUrl.isNotEmpty) {
      if (ApiConfig.isRetiredHost(savedBaseUrl)) {
        // A previous build shipped the parked `web.oryxa.us` address and users may have
        // saved it; keeping it would leave every request parsing a parking page.
        await prefs.remove(ApiConfig.storageKeyBaseUrl);
      } else {
        apiService.configure(baseUrl: savedBaseUrl);
      }
    }

    _token = prefs.getString(ApiConfig.storageKeyToken);
    _refreshToken = prefs.getString(ApiConfig.storageKeyRefreshToken);

    // A pre-patch build "signed in" with a fabricated `demo_token_…`. No Firebase session
    // backs it, so it has to be discarded: keeping it would render a dashboard whose every
    // request returns 401 and whose create buttons look broken.
    if (_token != null && _token!.startsWith('demo_token_')) {
      _token = null;
      _refreshToken = null;
      await prefs.remove(ApiConfig.storageKeyToken);
      await prefs.remove(ApiConfig.storageKeyRefreshToken);
      await prefs.remove(ApiConfig.storageKeyTokenExpiry);
      await prefs.remove(ApiConfig.storageKeyUser);
      debugPrint('[AuthService] discarded legacy demo session');
    }

    _selectedBusinessId = prefs.getString(ApiConfig.storageKeySelectedBusiness);

    final expiryMillis = prefs.getInt(ApiConfig.storageKeyTokenExpiry);
    if (expiryMillis != null) {
      _tokenExpiry = DateTime.fromMillisecondsSinceEpoch(expiryMillis);
    }

    final userJson = prefs.getString(ApiConfig.storageKeyUser);
    if (userJson != null) {
      try {
        _currentUser = UserModel.fromJson(jsonDecode(userJson));
      } catch (e) {
        debugPrint('[AuthService] error parsing stored user: $e');
      }
    }

    unawaited(_googleAuth.init());

    if (_token == null || _token!.isEmpty) return;
    apiService.setToken(_token);

    // Restore a session whose token has already lapsed before the first screen loads. The
    // renewal runs in the background: a merchant opening the app offline should see the UI
    // immediately, and the API layer retries through the same refresher on its first 401.
    if (_isExpired && _refreshToken != null && _refreshToken!.isNotEmpty) {
      unawaited(_refreshIdToken());
    }
  }

  bool get _isExpired =>
      _tokenExpiry != null && DateTime.now().isAfter(_tokenExpiry!.subtract(const Duration(seconds: 60)));

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

  /// Signs in the same way the web dashboard does: Firebase email/password first, then
  /// `POST /users/sync` (which creates the merchant row and derives its identity from the
  /// token) and `GET /users/me`.
  ///
  /// [customToken] exists for local development against an API that accepts a dev token;
  /// it is never used as a fallback for a failed password sign-in.
  Future<UserModel> login({
    required String email,
    required String password,
    String? customToken,
  }) async {
    if (customToken != null && customToken.isNotEmpty) {
      return _establishSession(token: customToken, firebaseUid: null);
    }

    final apiKey = await _resolveFirebaseApiKey();
    final session = await _signInWithPassword(apiKey, email.trim(), password);

    _token = session.idToken;
    _refreshToken = session.refreshToken;
    _tokenExpiry = DateTime.now().add(Duration(seconds: session.expiresIn));
    apiService.setToken(_token);
    await _persistSession();

    return _establishSession(
      token: session.idToken,
      firebaseUid: session.localId,
      email: session.email ?? email.trim(),
      displayName: session.displayName,
    );
  }

  /// Signs in with Google via the embedded Chrome page. The page returns a Firebase ID
  /// token (and, when available, a refresh token) through a custom scheme redirect.
  /// Always logs out from any existing session first to allow fresh account selection.
  Future<UserModel> loginWithGoogle() async {
    appDiagnostics.recordMessage('Google sign-in', 'Logging out existing session before Google sign-in');
    try {
      await logout();
      final result = await _googleAuth.signIn();
      return await _applyGoogleResult(result);
    } catch (e) {
      appDiagnostics.recordMessage('Google sign-in', 'Failed: $e');
      rethrow;
    }
  }

  Future<UserModel> _applyGoogleResult(GoogleSignInResult result) async {
    _token = result.idToken;
    _refreshToken = result.refreshToken;
    _tokenExpiry = DateTime.now().add(Duration(seconds: result.expiresIn));
    apiService.setToken(_token);
    await _persistSession();

    if (result.refreshToken == null || result.refreshToken!.isEmpty) {
      appDiagnostics.recordMessage(
        'Google sign-in',
        'Signed in without a refresh token; the session lasts about one hour.',
      );
    }

    final user = await _establishSession(
      token: result.idToken,
      firebaseUid: result.uid,
      email: result.email,
      displayName: result.name,
      signInMethod: 'google',
    );
    notifyListeners();
    return user;
  }

  /// Creates the merchant record if this Firebase account has never used the dashboard,
  /// then reads the authoritative user row.
  Future<UserModel> _establishSession({
    required String token,
    String? firebaseUid,
    String? email,
    String? displayName,
    String signInMethod = 'password',
  }) async {
    _token = token;
    apiService.setToken(token);

    Map<String, dynamic>? synced;
    try {
      final res = await apiService.post(
        ApiConfig.pathUsersSync,
        body: {'signInMethod': signInMethod},
      );
      if (res is Map) synced = Map<String, dynamic>.from(res);
    } catch (e) {
      // A user row may already exist; `/users/me` below is the real check.
      debugPrint('[AuthService] user sync failed: $e');
    }

    dynamic me;
    try {
      me = await apiService.get(ApiConfig.pathUsersMe);
    } catch (e) {
      await logout();
      if (e is ApiException && e.statusCode == 401) {
        throw AuthException(
          'Signed in, but the merchant profile could not be created. Try again in a moment.',
        );
      }
      throw AuthException(_apiErrorMessage(e));
    }

    final meMap = me is Map ? Map<String, dynamic>.from(me) : <String, dynamic>{};
    final user = UserModel(
      id: (meMap['id'] ?? synced?['id'] ?? '').toString(),
      firebaseUid: (synced?['firebaseUid'] ?? firebaseUid ?? '').toString(),
      name: (meMap['name'] ?? synced?['name'] ?? displayName ?? 'Merchant').toString(),
      email: (meMap['email'] ?? synced?['email'] ?? email)?.toString(),
      role: (synced?['role'])?.toString(),
    );

    if (user.id.isEmpty) {
      await logout();
      throw AuthException('Signed in, but the merchant profile could not be loaded.');
    }

    _currentUser = user;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.storageKeyUser, jsonEncode(user.toJson()));
    return user;
  }

  Future<_FirebaseSession> _signInWithPassword(String apiKey, String email, String password) async {
    final uri = Uri.parse('$_identityToolkitBase/accounts:signInWithPassword?key=$apiKey');
    http.Response res;
    try {
      res = await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
            body: jsonEncode({
              'email': email,
              'password': password,
              'returnSecureToken': true,
            }),
          )
          .timeout(const Duration(seconds: 20));
    } catch (e) {
      throw AuthException('Could not reach the sign-in service. Check your connection and try again.');
    }

    final body = _decodeJson(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw AuthException(_firebaseErrorMessage(body));
    }

    final idToken = body['idToken'];
    final refreshToken = body['refreshToken'];
    if (idToken is! String || idToken.isEmpty || refreshToken is! String || refreshToken.isEmpty) {
      throw AuthException('The sign-in service returned an unexpected response.');
    }

    return _FirebaseSession(
      idToken: idToken,
      refreshToken: refreshToken,
      expiresIn: int.tryParse(body['expiresIn']?.toString() ?? '') ?? 3600,
      localId: body['localId']?.toString(),
      email: body['email']?.toString(),
      displayName: body['displayName']?.toString(),
    );
  }

  /// Fetches the public Firebase web config from the dashboard. Those values are already
  /// served to every browser that loads the web app; they are not server secrets.
  Future<String> _resolveFirebaseApiKey() async {
    if (_firebaseApiKey != null && _firebaseApiKey!.isNotEmpty) return _firebaseApiKey!;
    if (_envApiKey.isNotEmpty) {
      _firebaseApiKey = _envApiKey;
      return _envApiKey;
    }

    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(ApiConfig.storageKeyFirebaseApiKey);
    if (cached != null && cached.isNotEmpty) {
      _firebaseApiKey = cached;
      return cached;
    }

    final url = ApiConfig.mobileFirebaseConfigUrl(apiService.baseUrl);
    http.Response res;
    try {
      res = await http
          .get(Uri.parse(url), headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 15));
    } catch (e) {
      throw AuthException('Could not load the sign-in configuration. Check your connection.');
    }

    final body = _decodeJson(res.body);
    final key = body['apiKey'] ?? body['firebaseApiKey'];
    if (res.statusCode >= 200 && res.statusCode < 300 && key is String && key.isNotEmpty) {
      _firebaseApiKey = key;
      await prefs.setString(ApiConfig.storageKeyFirebaseApiKey, key);
      return key;
    }

    throw AuthException(
      'Sign-in is not configured on this server (HTTP ${res.statusCode}). '
      'Point the app at https://onlyorders.tech/api/v1.',
    );
  }

  /// Exchanges the refresh token for a new ID token. Concurrent callers share one request.
  Future<String?> _refreshIdToken() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;

    final future = _performRefresh();
    _refreshInFlight = future;
    return future.whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<String?> _performRefresh() async {
    final refreshToken = _refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return null;

    try {
      final apiKey = await _resolveFirebaseApiKey();
      final res = await http
          .post(
            Uri.parse('$_secureTokenUrl?key=$apiKey'),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
            },
            body: {
              'grant_type': 'refresh_token',
              'refresh_token': refreshToken,
            },
          )
          .timeout(const Duration(seconds: 20));

      final body = _decodeJson(res.body);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        debugPrint('[AuthService] token refresh rejected: ${body['error']}');
        return null;
      }

      final idToken = body['id_token'];
      if (idToken is! String || idToken.isEmpty) return null;

      _token = idToken;
      final newRefresh = body['refresh_token'];
      if (newRefresh is String && newRefresh.isNotEmpty) {
        _refreshToken = newRefresh;
      }
      final expiresIn = int.tryParse(body['expires_in']?.toString() ?? '') ?? 3600;
      _tokenExpiry = DateTime.now().add(Duration(seconds: expiresIn));
      apiService.setToken(idToken);
      await _persistSession();
      return idToken;
    } catch (e) {
      debugPrint('[AuthService] token refresh failed: $e');
      return null;
    }
  }

  Future<void> _persistSession() async {
    final prefs = await SharedPreferences.getInstance();
    if (_token != null) {
      await prefs.setString(ApiConfig.storageKeyToken, _token!);
    }
    if (_refreshToken != null) {
      await prefs.setString(ApiConfig.storageKeyRefreshToken, _refreshToken!);
    }
    if (_tokenExpiry != null) {
      await prefs.setInt(ApiConfig.storageKeyTokenExpiry, _tokenExpiry!.millisecondsSinceEpoch);
    }
  }

  Future<void> logout() async {
    _token = null;
    _refreshToken = null;
    _tokenExpiry = null;
    _currentUser = null;
    _selectedBusinessId = null;
    apiService.setToken(null);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(ApiConfig.storageKeyToken);
    await prefs.remove(ApiConfig.storageKeyRefreshToken);
    await prefs.remove(ApiConfig.storageKeyTokenExpiry);
    await prefs.remove(ApiConfig.storageKeyUser);
    await prefs.remove(ApiConfig.storageKeySelectedBusiness);
  }

  Map<String, dynamic> _decodeJson(String body) {
    if (body.trim().isEmpty) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(body);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  /// Firebase reports a single `message` code; saying "incorrect email or password" is both
  /// true and safer than revealing whether an account exists.
  String _firebaseErrorMessage(Map<String, dynamic> body) {
    final error = body['error'];
    final raw = error is Map ? error['message']?.toString() : error?.toString();
    final code = (raw ?? '').split(' ').first;

    switch (code) {
      case 'EMAIL_NOT_FOUND':
      case 'INVALID_PASSWORD':
      case 'INVALID_LOGIN_CREDENTIALS':
      case 'INVALID_EMAIL':
        return 'Incorrect email or password.';
      case 'USER_DISABLED':
        return 'This account has been disabled.';
      case 'TOO_MANY_ATTEMPTS_TRY_LATER':
        return 'Too many sign-in attempts. Try again in a few minutes.';
      case 'OPERATION_NOT_ALLOWED':
        return 'Email and password sign-in is disabled for this project.';
      case 'API_KEY_INVALID':
      case 'INVALID_API_KEY':
        return 'The app is using an invalid Firebase key. Update the app and try again.';
      case 'MISSING_PASSWORD':
        return 'Enter your password.';
      default:
        return raw != null && raw.isNotEmpty
            ? 'Sign-in failed ($raw).'
            : 'Sign-in failed. Check your email and password.';
    }
  }

  String _apiErrorMessage(Object error) {
    if (error is ApiException) return error.message;
    return error.toString();
  }
}

class _FirebaseSession {
  final String idToken;
  final String refreshToken;
  final int expiresIn;
  final String? localId;
  final String? email;
  final String? displayName;

  _FirebaseSession({
    required this.idToken,
    required this.refreshToken,
    required this.expiresIn,
    this.localId,
    this.email,
    this.displayName,
  });
}
