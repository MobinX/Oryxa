import 'dart:async';
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
import '../services/notification_service.dart';

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
  String? _statsError;
  bool _officialMigrationPending = false;
  bool get officialMigrationPending => _officialMigrationPending;

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
  String? get statsError => _statsError;

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

      // An admin signs in, so this device asks for inbox alerts and subscribes its FCM
      // token. The call is not awaited: the console opens even if FCM is slow.
      unawaited(NotificationService.instance.requestAdminMailPush(apiService));

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
    // Stop this device's mailbox alerts while the admin token is still valid. The API
    // logout below also revokes the session on the server, so a failed call here is not
    // a hole.
    try {
      await NotificationService.instance
          .unsubscribeAdminMailPush(apiService)
          .timeout(const Duration(seconds: 6), onTimeout: () {});
    } catch (e) {
      debugPrint('[AdminProvider] Mail push unsubscribe skipped: $e');
    }

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
    List<Map<String, dynamic>>? uploadedAttachments,
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
          if (uploadedAttachments != null && uploadedAttachments.isNotEmpty)
            'uploaded_attachments': uploadedAttachments,
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
    List<Map<String, dynamic>>? uploadedAttachments,
  }) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminMailReply(id),
        body: {
          'text': text,
          'html': html ?? text,
          if (cc != null && cc.isNotEmpty) 'cc': cc,
          if (bcc != null && bcc.isNotEmpty) 'bcc': bcc,
          if (uploadedAttachments != null && uploadedAttachments.isNotEmpty)
            'uploaded_attachments': uploadedAttachments,
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

    _statsError = null;
    try {
      final res = await apiService.get(ApiConfig.pathAdminStats(days: _statsDays));
      if (res is Map) {
        _stats = AdminStatsData.fromJson(Map<String, dynamic>.from(res));
      }
    } catch (e) {
      _statsError = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
      debugPrint('[AdminProvider] Error fetching admin stats: $e');
    } finally {
      _isStatsLoading = false;
      notifyListeners();
    }
  }

  // ==========================================
  // DEFAULT AGENT & PROMPT ACTIONS
  // ==========================================
  Future<Map<String, dynamic>?> fetchDefaultAgent() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminDefaultAgent);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching default agent: $e');
    }
    return null;
  }

  Future<bool> updateDefaultAgent({
    required String systemPrompt,
    String? replyGuidance,
    String? commentReplyGuidance,
  }) async {
    try {
      await apiService.put(
        ApiConfig.pathAdminDefaultAgent,
        body: {
          'systemPrompt': systemPrompt,
          'replyGuidance': replyGuidance,
          'commentReplyGuidance': commentReplyGuidance,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating default agent: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> fetchDefaultAgentOverrides() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminDefaultAgentOverrides);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching default agent overrides: $e');
    }
    return null;
  }

  Future<bool> revertOverrideToDefault(String agentId) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminDefaultAgentFollow,
        body: {'agentId': agentId},
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error reverting override: $e');
      return false;
    }
  }

  // ==========================================
  // MODEL BILLING ACTIONS
  // ==========================================
  Future<Map<String, dynamic>?> fetchModelBilling() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminModelBilling);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching model billing: $e');
    }
    return null;
  }

  Future<bool> updateModelBilling({
    required String provider,
    required String model,
    required double inputUsdPerMillion,
    required double outputUsdPerMillion,
    required double cachedInputUsdPerMillion,
  }) async {
    try {
      await apiService.put(
        ApiConfig.pathAdminModelBilling,
        body: {
          'provider': provider,
          'model': model,
          'inputUsdPerMillion': inputUsdPerMillion,
          'outputUsdPerMillion': outputUsdPerMillion,
          'cachedInputUsdPerMillion': cachedInputUsdPerMillion,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating model billing: $e');
      rethrow;
    }
  }

  /// The web dashboard's CSV link. Returns the raw text so the caller can save/share it.
  Future<String> fetchAdminCsv() => apiService.getText(ApiConfig.pathAdminExportCsv);

  // ==========================================
  // EVENT LOG ACTIONS
  // ==========================================
  Future<List<Map<String, dynamic>>> fetchLogTypes() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminLogTypes());
      if (res is Map && res['types'] is List) {
        return (res['types'] as List)
            .map((t) => Map<String, dynamic>.from(t as Map))
            .toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching log types: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>?> fetchLogStorage() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminLogStorage);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching log storage: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> fetchLogEvents({
    String? type,
    String? start,
    String? end,
    String? cursor,
    int limit = 50,
  }) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminLogsQuery(
        type: type,
        start: start,
        end: end,
        cursor: cursor,
        limit: limit,
      ));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching log events: $e');
      rethrow;
    }
    return null;
  }

  // ==========================================
  // SUBAGENT PROMPTS
  // ==========================================
  Future<Map<String, dynamic>?> fetchSubagent(String key) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminSubagent(key));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching subagent: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> saveSubagent(String key, String systemPrompt) async {
    try {
      final res = await apiService.put(
        ApiConfig.pathAdminSubagent(key),
        body: {'systemPrompt': systemPrompt},
      );
      if (res is Map) return Map<String, dynamic>.from(res);
      return <String, dynamic>{};
    } catch (e) {
      debugPrint('[AdminProvider] Error saving subagent: $e');
      rethrow;
    }
  }

  // ==========================================
  // CONSOLE PASSWORD
  // ==========================================
  Future<void> changeConsolePassword(String current, String next) async {
    await apiService.post(
      ApiConfig.pathAdminChangePassword,
      body: {'current': current, 'next': next},
    );
  }

  // ==========================================
  // TOKEN USAGE ACTIONS
  // ==========================================
  Future<Map<String, dynamic>?> fetchTokenUsage({String? month}) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminTokenUsage(month: month));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching token usage: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> fetchBusinessTokenUsageDetail(String businessId, {String? month}) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminBusinessTokenUsage(businessId, month: month));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching business token usage detail: $e');
    }
    return null;
  }

  // ==========================================
  // PLANS & BUSINESS CAPS ACTIONS
  // ==========================================
  Future<List<Map<String, dynamic>>> fetchAdminPlans() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminPlans);
      if (res is List) {
        return res.map((item) => Map<String, dynamic>.from(item as Map)).toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching plans: $e');
    }
    return [];
  }

  Future<List<Map<String, dynamic>>> fetchAdminBusinessPlans() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminBusinessPlans);
      if (res is Map && res['businesses'] is List) {
        return (res['businesses'] as List).map((item) => Map<String, dynamic>.from(item as Map)).toList();
      } else if (res is List) {
        return res.map((item) => Map<String, dynamic>.from(item as Map)).toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching business plans: $e');
    }
    return [];
  }

  Future<bool> createPlan(Map<String, dynamic> body) async {
    try {
      await apiService.post(ApiConfig.pathAdminPlans, body: body);
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error creating plan: $e');
      rethrow;
    }
  }

  Future<int> updatePlan(String id, Map<String, dynamic> body) async {
    try {
      final res = await apiService.patch(ApiConfig.pathAdminPlan(id), body: body);
      if (res is Map) return (res['notified'] as num?)?.toInt() ?? 0;
      return 0;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating plan: $e');
      rethrow;
    }
  }

  /// Returns the list of businesses still on the plan when the API refused deletion.
  Future<List<dynamic>?> deletePlan(String id) async {
    try {
      await apiService.delete(ApiConfig.pathAdminPlan(id));
      return null;
    } on ApiException catch (e) {
      if (e.statusCode == 409 && e.body is Map && e.body['businesses'] is List) {
        return e.body['businesses'] as List;
      }
      rethrow;
    }
  }

  Future<void> retirePlan(String id, Map<String, dynamic> plan) async {
    final body = Map<String, dynamic>.from(plan)..['active'] = false;
    await updatePlan(id, body);
  }

  Future<bool> assignBusinessPlan(String businessId, String? planId) async {
    try {
      await apiService.put(
        ApiConfig.pathAdminBusinessPlan(businessId),
        body: {'planId': planId},
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error assigning plan: $e');
      rethrow;
    }
  }

  Future<bool> setBusinessCaps(
    String businessId, {
    required int? messageLimitOverride,
    required int? commentLimitOverride,
  }) async {
    try {
      await apiService.put(
        ApiConfig.pathAdminBusinessCaps(businessId),
        body: {
          'messageLimitOverride': messageLimitOverride,
          'commentLimitOverride': commentLimitOverride,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error setting business caps: $e');
      rethrow;
    }
  }

  Future<bool> resetBusinessCycle(String businessId) async {
    try {
      await apiService.post(ApiConfig.pathAdminBusinessPlanReset(businessId));
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error resetting cycle: $e');
      rethrow;
    }
  }

  Future<List<Map<String, dynamic>>> fetchBusinessAssignments(String businessId) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminBusinessAssignments(businessId));
      if (res is List) {
        return res.map((a) => Map<String, dynamic>.from(a as Map)).toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching assignments: $e');
    }
    return [];
  }

  // ==========================================
  // OFFICIAL CHANNELS & TICKETS & PROSPECTS
  // ==========================================
  Future<List<Map<String, dynamic>>> fetchOfficialChannels() async {
    _officialMigrationPending = false;
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialChannels);
      if (res is Map && res['channels'] is List) {
        return (res['channels'] as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
      }
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official channels: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>> verifyOfficialChannel(String channelId) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialChannelVerify(channelId));
      if (res is Map) return Map<String, dynamic>.from(res);
      return {'verified': false, 'error': 'Invalid response'};
    } catch (e) {
      debugPrint('[AdminProvider] Error verifying channel: $e');
      return {'verified': false, 'error': e.toString()};
    }
  }

  Future<bool> disconnectOfficialChannel(String channelId) async {
    try {
      await apiService.post(ApiConfig.pathAdminOfficialChannelDisconnect(channelId), body: {});
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error disconnecting channel: $e');
      return false;
    }
  }

  Future<Map<String, dynamic>> connectOfficialWhatsApp(String token, String phoneNumberId) async {
    try {
      final res = await apiService.post(
        ApiConfig.pathAdminOfficialWhatsAppConnect,
        body: {'token': token, 'phoneNumberId': phoneNumberId},
      );
      if (res is Map) return Map<String, dynamic>.from(res);
      return {'verified': false, 'error': 'Invalid server response'};
    } catch (e) {
      debugPrint('[AdminProvider] Error connecting WhatsApp: $e');
      return {'verified': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> fetchOfficialSettings() async {
    _officialMigrationPending = false;
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialSettings);
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official settings: $e');
    }
    return null;
  }

  Future<bool> updateOfficialSettings(Map<String, dynamic> data) async {
    try {
      await apiService.patch(ApiConfig.pathAdminOfficialSettings, body: data);
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating official settings: $e');
      rethrow;
    }
  }

  // Official Inbox
  Future<List<Map<String, dynamic>>> fetchOfficialConversations({String? platform}) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialConversations(platform: platform));
      if (res is Map && res['conversations'] is List) {
        return (res['conversations'] as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
      }
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official conversations: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>?> fetchOfficialThread(String conversationId) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialConversation(conversationId));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official thread: $e');
    }
    return null;
  }

  Future<bool> replyOfficialThread(String conversationId, String content, {bool? paused}) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminOfficialConversationReply(conversationId),
        body: {
          'content': content,
          if (paused != null) 'paused': paused,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error replying to official thread: $e');
      return false;
    }
  }

  Future<bool> takeoverOfficialConversation(String conversationId, bool paused) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminOfficialConversationTakeover(conversationId),
        body: {'paused': paused},
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error setting takeover: $e');
      return false;
    }
  }

  // Official Tickets
  Future<List<Map<String, dynamic>>> fetchOfficialTickets({String? status, String? type}) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialTickets(status: status, type: type));
      if (res is Map && res['tickets'] is List) {
        return (res['tickets'] as List).map((t) => Map<String, dynamic>.from(t as Map)).toList();
      }
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official tickets: $e');
    }
    return [];
  }

  Future<bool> updateOfficialTicket(String id, {String? status, String? priority, String? notes}) async {
    try {
      await apiService.patch(
        ApiConfig.pathAdminOfficialTicket(id),
        body: {
          if (status != null) 'status': status,
          if (priority != null) 'priority': priority,
          if (notes != null) 'notes': notes,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating ticket: $e');
      return false;
    }
  }

  // Official Prospects
  Future<Map<String, dynamic>> fetchOfficialProspects({String? status}) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialProspects(status: status));
      if (res is Map) {
        final prospects = (res['prospects'] as List? ?? []).map((p) => Map<String, dynamic>.from(p as Map)).toList();
        final weights = res['weights'] is Map ? Map<String, dynamic>.from(res['weights'] as Map) : <String, dynamic>{};
        return {'prospects': prospects, 'weights': weights};
      }
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching official prospects: $e');
    }
    return {'prospects': <Map<String, dynamic>>[], 'weights': <String, dynamic>{}};
  }

  Future<bool> updateOfficialProspectStatus(String id, String status, {String? notes}) async {
    try {
      await apiService.patch(
        ApiConfig.pathAdminOfficialProspect(id),
        body: {
          'status': status,
          if (notes != null) 'notes': notes,
        },
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error updating prospect: $e');
      return false;
    }
  }

  Future<bool> saveOfficialWeights(Map<String, dynamic> weights) async {
    try {
      await apiService.patch(
        ApiConfig.pathAdminOfficialProspectWeights,
        body: weights,
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error saving weights: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> fetchOfficialTicketDetail(String id) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialTicket(id));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      if (e is ApiException && e.statusCode == 503) {
        _officialMigrationPending = true;
      }
      debugPrint('[AdminProvider] Error fetching ticket detail: $e');
    }
    return null;
  }

  Future<bool> addOfficialTicketNote(String id, String note) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminOfficialTicketNotes(id),
        body: {'note': note},
      );
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error adding ticket note: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> fetchOfficialProspectDetail(String id) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialProspect(id));
      if (res is Map) return Map<String, dynamic>.from(res);
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching prospect: $e');
    }
    return null;
  }

  Future<List<Map<String, dynamic>>> fetchOfficialProspectEvents(String id) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminOfficialProspectEvents(id));
      if (res is Map && res['events'] is List) {
        return (res['events'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      if (res is List) {
        return res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching prospect events: $e');
    }
    return [];
  }

  Future<int> rescoreOfficialProspects() async {
    try {
      final res = await apiService.post(ApiConfig.pathAdminOfficialProspectRescore, body: {});
      if (res is Map) return (res['rescanned'] as num?)?.toInt() ?? 0;
      return 0;
    } catch (e) {
      debugPrint('[AdminProvider] Error re-scoring prospects: $e');
      rethrow;
    }
  }

  // ==========================================
  // STORE CHANNELS (FACEBOOK OAUTH)
  // ==========================================
  Future<String?> fetchFacebookAuthUrl() async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminFacebookAuth);
      if (res is Map) return res['url']?.toString();
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching Facebook auth URL: $e');
      rethrow;
    }
    return null;
  }

  Future<List<Map<String, dynamic>>> fetchFacebookPendingPages(String token) async {
    try {
      final res = await apiService.get(ApiConfig.pathAdminFacebookPending(token));
      if (res is Map && res['pages'] is List) {
        return (res['pages'] as List).map((p) => Map<String, dynamic>.from(p as Map)).toList();
      }
    } catch (e) {
      debugPrint('[AdminProvider] Error fetching pending Facebook pages: $e');
      rethrow;
    }
    return [];
  }

  Future<Map<String, dynamic>> connectFacebookPages(String token, List<String> pageIds) async {
    try {
      final res = await apiService.post(
        ApiConfig.pathAdminFacebookConnect,
        body: {'token': token, 'pageIds': pageIds},
      );
      if (res is Map) return Map<String, dynamic>.from(res);
      return {'connected': [], 'failed': []};
    } catch (e) {
      debugPrint('[AdminProvider] Error connecting Facebook pages: $e');
      rethrow;
    }
  }

  // ==========================================
  // MAIL ATTACHMENTS & FORWARD
  // ==========================================
  Future<Map<String, dynamic>> signMailAttachment({
    required String filename,
    required String contentType,
    required int size,
  }) async {
    final res = await apiService.post(
      ApiConfig.pathAdminMailAttachmentSign,
      body: {'filename': filename, 'contentType': contentType, 'size': size},
    );
    if (res is Map) return Map<String, dynamic>.from(res);
    throw Exception('Invalid attachment signing response');
  }

  String mailAttachmentUrl(String emailId, String attachmentId) =>
      '${ApiConfig.webOrigin(apiService.baseUrl)}'
      '${ApiConfig.pathAdminMailAttachment(emailId, attachmentId)}';

  Future<bool> forwardEmail(
    String id, {
    required List<String> to,
    List<String>? cc,
    List<String>? bcc,
    String? text,
    List<Map<String, dynamic>>? uploadedAttachments,
  }) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminMailForward(id),
        body: {
          'to': to,
          if (cc != null && cc.isNotEmpty) 'cc': cc,
          if (bcc != null && bcc.isNotEmpty) 'bcc': bcc,
          if (text != null) 'text': text,
          if (uploadedAttachments != null && uploadedAttachments.isNotEmpty)
            'uploaded_attachments': uploadedAttachments,
        },
      );
      await fetchEmails(refresh: true);
      return true;
    } catch (e) {
      debugPrint('[AdminProvider] Error forwarding email: $e');
      rethrow;
    }
  }
}
