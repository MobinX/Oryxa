import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/admin_mail.dart';
import '../models/admin_stats.dart';
import '../models/admin_user.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';

class AdminProvider extends ChangeNotifier {
  final ApiService apiService;
  final AuthService authService;

  AdminUser? _adminUser;
  String? _adminToken;
  String? _adminFirebaseToken;
  String _sessionType = 'merchant';
  bool _isLoading = false;
  String? _errorMessage;

  // Mailbox state
  MailboxInfo? _mailbox;
  MailStorageInfo? _storage;
  List<MailRow> _emails = [];
  bool _isMailLoading = false;
  String _currentFolder = 'inbox';
  String _searchQuery = '';
  int _mailTotal = 0;

  // Stats state
  AdminStatsData? _stats;
  bool _isStatsLoading = false;
  int _statsDays = 30;

  AdminProvider({required this.apiService, required this.authService});

  AdminUser? get adminUser => _adminUser;
  String? get adminToken => _adminToken;
  String? get adminFirebaseToken => _adminFirebaseToken;
  String get sessionType => _sessionType;
  bool get isAuthenticated => _adminToken != null && _adminToken!.isNotEmpty && _adminUser != null;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  // Mailbox getters
  MailboxInfo? get mailbox => _mailbox;
  MailStorageInfo? get storage => _storage;
  List<MailRow> get emails => _emails;
  bool get isMailLoading => _isMailLoading;
  String get currentFolder => _currentFolder;
  String get searchQuery => _searchQuery;
  int get mailTotal => _mailTotal;

  // Stats getters
  AdminStatsData? get stats => _stats;
  bool get isStatsLoading => _isStatsLoading;
  int get statsDays => _statsDays;

  bool can(String capability) {
    if (_adminUser == null) return false;
    return _adminUser!.hasCapability(capability);
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final sessionType = prefs.getString(ApiConfig.storageKeyUserSessionType);
    _sessionType = sessionType ?? 'merchant';
    final savedToken = prefs.getString(ApiConfig.storageKeyAdminToken);
    final savedUserJson = prefs.getString(ApiConfig.storageKeyAdminUser);
    _adminFirebaseToken = prefs.getString(ApiConfig.storageKeyAdminFirebaseToken);

    if (savedToken != null && savedToken.isNotEmpty && savedUserJson != null) {
      try {
        _adminToken = savedToken;
        _adminUser = AdminUser.fromJson(jsonDecode(savedUserJson));
        if (sessionType == 'admin') {
          apiService.setToken(savedToken);
        }
      } catch (e) {
        debugPrint('[AdminProvider] Error restoring admin user: $e');
      }
    }
    notifyListeners();
  }

  /// Logs into the console using the admin endpoint. Automatically performs Firebase
  /// sign-in with returned or default fallback credentials as done in the web app.
  Future<bool> adminLogin(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final webUrl = '${ApiConfig.webOrigin(apiService.baseUrl)}${ApiConfig.pathAdminLogin}';
      final directUrl = '${ApiConfig.webOrigin(apiService.baseUrl)}${ApiConfig.pathApi2AdminLogin}';

      http.Response response;
      try {
        response = await http
            .post(
              Uri.parse(webUrl),
              headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
              body: jsonEncode({'email': email.trim(), 'password': password}),
            )
            .timeout(const Duration(seconds: 15));
      } catch (_) {
        // Fallback to direct API if web proxy is unreachable
        response = await http
            .post(
              Uri.parse(directUrl),
              headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
              body: jsonEncode({'email': email.trim(), 'password': password}),
            )
            .timeout(const Duration(seconds: 15));
      }

      final body = jsonDecode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300 || body is! Map) {
        final err = (body is Map ? body['error'] : null) ?? 'Sign-in failed (${response.statusCode})';
        throw Exception(err.toString());
      }

      final map = Map<String, dynamic>.from(body);
      final token = (map['token'] ?? '').toString();
      final userData = map['user'];

      if (token.isEmpty || userData is! Map) {
        throw Exception('Sign-in failed: invalid credentials or token');
      }

      final user = AdminUser.fromJson(Map<String, dynamic>.from(userData));
      _adminToken = token;
      _adminUser = user;
      _sessionType = 'admin';

      // Update API Service to use admin token
      apiService.setToken(token);

      // Persist session
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(ApiConfig.storageKeyUserSessionType, 'admin');
      await prefs.setString(ApiConfig.storageKeyAdminToken, token);
      await prefs.setString(ApiConfig.storageKeyAdminUser, jsonEncode(user.toJson()));

      // Firebase compatibility sign-in
      final firebaseData = map['firebase'];
      String? fbEmail;
      String? fbPassword;
      if (firebaseData is Map) {
        fbEmail = firebaseData['email']?.toString();
        fbPassword = firebaseData['password']?.toString();
      }

      // Default fallback if not provided
      fbEmail ??= 'admin123@oryxa.app';
      fbPassword ??= 'admin123';

      try {
        final fbToken = await authService.signInWithFirebaseCredentials(fbEmail, fbPassword);
        if (fbToken != null && fbToken.isNotEmpty) {
          _adminFirebaseToken = fbToken;
          await prefs.setString(ApiConfig.storageKeyAdminFirebaseToken, fbToken);

          // Notify web firebase-session if available
          try {
            await http.post(
              Uri.parse('${ApiConfig.webOrigin(apiService.baseUrl)}/api/admin/firebase-session'),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer $token',
                'Cookie': 'oryxa_console_session=$token',
              },
              body: jsonEncode({'idToken': fbToken}),
            ).timeout(const Duration(seconds: 5));
          } catch (_) {}
        }
      } catch (fbErr) {
        debugPrint('[AdminProvider] Firebase compatibility notice: $fbErr');
      }

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst(RegExp(r'^Exception: '), '');
      notifyListeners();
      return false;
    }
  }

  Future<void> adminLogout() async {
    try {
      if (_adminToken != null) {
        await http.post(
          Uri.parse('${ApiConfig.webOrigin(apiService.baseUrl)}${ApiConfig.pathAdminLogout}'),
          headers: {'Authorization': 'Bearer $_adminToken'},
        ).timeout(const Duration(seconds: 5));
      }
    } catch (_) {}

    _adminToken = null;
    _adminUser = null;
    _adminFirebaseToken = null;
    _sessionType = 'merchant';
    _mailbox = null;
    _storage = null;
    _emails = [];
    _stats = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(ApiConfig.storageKeyAdminToken);
    await prefs.remove(ApiConfig.storageKeyAdminUser);
    await prefs.remove(ApiConfig.storageKeyAdminFirebaseToken);
    await prefs.setString(ApiConfig.storageKeyUserSessionType, 'merchant');

    // Restore merchant token if available
    final merchantToken = prefs.getString(ApiConfig.storageKeyToken);
    apiService.setToken(merchantToken);

    notifyListeners();
  }

  Future<void> switchToMerchant() async {
    _sessionType = 'merchant';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.storageKeyUserSessionType, 'merchant');
    final merchantToken = prefs.getString(ApiConfig.storageKeyToken);
    apiService.setToken(merchantToken);
    notifyListeners();
  }

  Future<void> switchToAdmin() async {
    if (_adminToken != null && _adminToken!.isNotEmpty) {
      _sessionType = 'admin';
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(ApiConfig.storageKeyUserSessionType, 'admin');
      apiService.setToken(_adminToken);
      notifyListeners();
    }
  }

  void setSessionType(String type) {
    _sessionType = type;
    notifyListeners();
  }

  // ==========================================
  // MAILBOX ACTIONS
  // ==========================================

  Future<void> fetchMailbox() async {
    if (!can('inbox')) return;
    try {
      final res = await apiService.get(ApiConfig.pathAdminMailbox);
      if (res is Map && res['mailbox'] is Map) {
        _mailbox = MailboxInfo.fromJson(Map<String, dynamic>.from(res['mailbox']));
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error loading mailbox: $e');
    }
  }

  Future<void> fetchStorage() async {
    if (!can('inbox')) return;
    try {
      final res = await apiService.get(ApiConfig.pathAdminMailStorage);
      if (res is Map) {
        _storage = MailStorageInfo.fromJson(Map<String, dynamic>.from(res));
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error loading storage: $e');
    }
  }

  Future<void> fetchEmails({
    String? folder,
    String? query,
    int limit = 40,
    int offset = 0,
    bool refresh = false,
  }) async {
    if (!can('inbox')) return;

    if (folder != null) _currentFolder = folder;
    if (query != null) _searchQuery = query;

    _isMailLoading = true;
    if (refresh) _emails = [];
    notifyListeners();

    try {
      final path = ApiConfig.pathAdminEmails(
        folder: _currentFolder,
        q: _searchQuery.isNotEmpty ? _searchQuery : null,
        limit: limit,
        offset: offset,
      );

      final res = await apiService.get(path);
      if (res is Map) {
        final emailList = <MailRow>[];
        if (res['emails'] is List) {
          for (final item in res['emails'] as List) {
            if (item is Map) {
              emailList.add(MailRow.fromJson(Map<String, dynamic>.from(item)));
            }
          }
        }
        _emails = emailList;
        _mailTotal = (res['total'] as num?)?.toInt() ?? emailList.length;
        if (res['mailbox'] is Map) {
          _mailbox = MailboxInfo.fromJson(Map<String, dynamic>.from(res['mailbox']));
        }
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching emails: $e');
    } finally {
      _isMailLoading = false;
      notifyListeners();
    }
  }

  Future<MailContent?> fetchEmailDetail(String id) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminEmailDetail(id));
      if (res is Map && res['content'] is Map) {
        return MailContent.fromJson(Map<String, dynamic>.from(res['content']));
      } else if (res is Map && res['email'] is Map) {
        // Fallback with email row info
        final row = MailRow.fromJson(Map<String, dynamic>.from(res['email']));
        return MailContent(
          id: row.id,
          mailboxId: row.mailboxId,
          direction: row.direction,
          from: row.from,
          to: [MailAddress(email: row.toEmail, name: row.toEmail)],
          cc: const [],
          bcc: const [],
          subject: row.subject,
          date: row.receivedAt ?? row.createdAt,
          text: '(Email body preview)',
          html: '',
          attachments: const [],
          sizeBytes: row.sizeBytes,
        );
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching email detail: $e');
    }
    return null;
  }

  Future<bool> sendEmail({
    required List<String> to,
    List<String>? cc,
    List<String>? bcc,
    required String subject,
    required String text,
    String? html,
  }) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminMailSend,
        body: {
          'to': to,
          if (cc != null && cc.isNotEmpty) 'cc': cc,
          if (bcc != null && bcc.isNotEmpty) 'bcc': bcc,
          'subject': subject,
          'text': text,
          'html': html ?? text,
        },
      );
      await fetchEmails(refresh: true);
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error sending email: $e');
      rethrow;
    }
  }

  Future<bool> replyEmail(
    String id, {
    required String text,
    String? html,
    List<String>? cc,
    List<String>? bcc,
  }) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminMailReply(id),
        body: {
          'text': text,
          'html': html ?? text,
          if (cc != null && cc.isNotEmpty) 'cc': cc,
          if (bcc != null && bcc.isNotEmpty) 'bcc': bcc,
        },
      );
      await fetchEmails(refresh: true);
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error replying to email: $e');
      rethrow;
    }
  }

  Future<bool> trashEmail(String id) async {
    try {
      await apiService.post(ApiConfig.pathAdminMailTrash(id));
      _emails.removeWhere((e) => e.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error trashing email: $e');
      return false;
    }
  }

  Future<bool> restoreEmail(String id) async {
    try {
      await apiService.post(ApiConfig.pathAdminMailRestore(id));
      _emails.removeWhere((e) => e.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error restoring email: $e');
      return false;
    }
  }

  Future<bool> deleteEmail(String id) async {
    try {
      await apiService.post(ApiConfig.pathAdminMailDelete(id));
      _emails.removeWhere((e) => e.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error deleting email: $e');
      return false;
    }
  }

  // ==========================================
  // STATS & ANALYTICS ACTIONS
  // ==========================================

  Future<void> fetchAdminStats({int? days}) async {
    if (!can('dashboard')) return;

    if (days != null) _statsDays = days;
    _isStatsLoading = true;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathAdminStats(days: _statsDays));
      if (res is Map) {
        _stats = AdminStatsData.fromJson(Map<String, dynamic>.from(res));
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching admin stats: $e');
    } finally {
      _isStatsLoading = false;
      notifyListeners();
    }
  }
}
