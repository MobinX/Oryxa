import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import '../services/api_service.dart';
import '../services/diagnostics_service.dart';

class FacebookPendingPage {
  final String id;
  final String name;
  final bool connected;
  final bool heldByOtherStore;
  final String? business;

  FacebookPendingPage({
    required this.id,
    required this.name,
    required this.connected,
    required this.heldByOtherStore,
    this.business,
  });

  factory FacebookPendingPage.fromJson(Map<String, dynamic> json) {
    return FacebookPendingPage(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      connected: json['connected'] == true,
      heldByOtherStore: json['heldByOtherStore'] == true,
      business: json['business']?.toString(),
    );
  }
}

class FacebookConnectResult {
  final String token;
  final String? businessId;

  FacebookConnectResult({required this.token, this.businessId});
}

class FacebookConnectService extends ChangeNotifier {
  FacebookConnectService({required this.apiService});

  final ApiService apiService;
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;
  Completer<FacebookConnectResult>? _pending;

  FacebookConnectResult? _pendingResult;
  FacebookConnectResult? get pendingResult => _pendingResult;
  void clearPendingResult() {
    _pendingResult = null;
    notifyListeners();
  }

  void Function(FacebookConnectResult)? onUnhandledResult;

  Future<void> init() async {
    _subscription ??= _appLinks.uriLinkStream.listen(
      (uri) => _dispatch(uri),
      onError: (Object e, StackTrace st) {
        appDiagnostics.recordMessage('Facebook connect', 'Deep link stream failed: $e');
      },
    );
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) await _dispatch(initial);
    } catch (e) {
      appDiagnostics.recordMessage('Facebook connect', 'Reading initial link failed: $e');
    }
  }

  Future<FacebookConnectResult> startConnect({
    required String businessId,
    bool portfolio = false,
    bool ads = false,
  }) async {
    final completer = Completer<FacebookConnectResult>();
    _pending = completer;

    final authUrl = await _getAuthUrl(businessId, portfolio: portfolio, ads: ads);
    appDiagnostics.recordMessage('Facebook connect', 'Opening Facebook OAuth');

    bool launched = false;
    try {
      launched = await launchUrl(Uri.parse(authUrl), mode: LaunchMode.inAppBrowserView);
    } catch (e) {
      appDiagnostics.recordMessage('Facebook connect', 'Custom Tab launch failed: $e');
    }
    if (!launched) {
      try {
        launched = await launchUrl(Uri.parse(authUrl), mode: LaunchMode.externalApplication);
      } catch (e) {
        appDiagnostics.recordMessage('Facebook connect', 'External browser launch failed: $e');
      }
    }
    if (!launched) {
      _pending = null;
      throw Exception('Could not open a browser window for Facebook.');
    }

    try {
      return await completer.future.timeout(
        const Duration(minutes: 5),
        onTimeout: () {
          _pending = null;
          throw Exception('Facebook connection timed out. Complete it in Chrome and return to the app.');
        },
      );
    } finally {
      _pending = null;
    }
  }

  Future<String> _getAuthUrl(String businessId, {bool portfolio = false, bool ads = false}) async {
    final uri = Uri.parse('${apiService.baseUrl}/${businessId}/channels/facebook/auth').replace(queryParameters: {
      'portfolio': portfolio ? 'true' : 'false',
      'ads': ads ? 'true' : 'false',
      'mobile': 'true',
    });
    final res = await http.get(uri, headers: {
      'Authorization': 'Bearer ${apiService.token}',
      'Accept': 'application/json',
    }).timeout(const Duration(seconds: 20));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Could not start Facebook connection (HTTP ${res.statusCode}).');
    }
    final body = jsonDecode(res.body);
    final url = body is Map ? body['url']?.toString() : null;
    if (url == null || url.isEmpty) throw Exception('Facebook OAuth URL missing.');
    return url;
  }

  Future<List<FacebookPendingPage>> fetchPendingPages(String businessId, String token) async {
    final uri = Uri.parse('${apiService.baseUrl}/${businessId}/channels/facebook/pending').replace(queryParameters: {'token': token});
    final res = await http.get(uri, headers: {
      'Authorization': 'Bearer ${apiService.token}',
      'Accept': 'application/json',
    }).timeout(const Duration(seconds: 20));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Could not load Facebook pages (HTTP ${res.statusCode}).');
    }
    final body = jsonDecode(res.body);
    if (body is! List) return const [];
    return body.whereType<Map>().map((e) => FacebookPendingPage.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<Map<String, dynamic>> connectPages(String businessId, String token, List<String> pageIds) async {
    final uri = Uri.parse('${apiService.baseUrl}/${businessId}/channels/facebook/connect');
    final res = await http.post(
      uri,
      headers: {
        'Authorization': 'Bearer ${apiService.token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({'token': token, 'pageIds': pageIds}),
    ).timeout(const Duration(seconds: 30));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Could not connect pages (HTTP ${res.statusCode}).');
    }
    final body = jsonDecode(res.body);
    return body is Map ? Map<String, dynamic>.from(body) : <String, dynamic>{};
  }

  @override
  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
    super.dispose();
  }

  Future<void> _dispatch(Uri uri) async {
    if (uri.scheme != ApiConfig.authCallbackScheme || uri.host != 'facebook') return;
    appDiagnostics.recordMessage('Facebook connect', 'Callback received from Chrome');
    final params = Uri.splitQueryString(uri.fragment);
    final encoded = params['p'];
    if (encoded == null || encoded.isEmpty) {
      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.completeError(Exception('No page selection token received.'));
      }
      return;
    }
    try {
      final normalized = _normalize(encoded);
      final decoded = utf8.decode(base64Url.decode(normalized));
      final json = jsonDecode(decoded);
      if (json is! Map) throw const FormatException('Invalid payload');
      final map = Map<String, dynamic>.from(json);
      final token = map['token']?.toString();
      if (token == null || token.isEmpty) throw const FormatException('Missing token');
      final result = FacebookConnectResult(token: token, businessId: map['businessId']?.toString());
      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.complete(result);
      } else {
        _pendingResult = result;
        notifyListeners();
        onUnhandledResult?.call(result);
      }
    } catch (e) {
      appDiagnostics.recordMessage('Facebook connect', 'Callback could not be read: $e');
      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.completeError(Exception('The Facebook response could not be read. Try again.'));
      }
    }
  }

  String _normalize(String value) {
    var out = value.replaceAll('-', '+').replaceAll('_', '/');
    while (out.length % 4 != 0) {
      out += '=';
    }
    return out;
  }
}
