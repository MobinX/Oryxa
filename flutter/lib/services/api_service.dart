import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;
  final dynamic body;

  ApiException(this.message, {this.statusCode = 500, this.body});

  @override
  String toString() => 'ApiException: [$statusCode] $message';
}

/// The sentence to show a merchant for any failure. Keeps provider code from leaking the
/// `ApiException:` prefix (or a raw `Exception:`) into snackbars.
String apiErrorMessage(Object error) {
  if (error is ApiException) return error.message;
  return error.toString().replaceFirst(RegExp(r'^Exception: '), '');
}

class ApiService {
  String _baseUrl = ApiConfig.defaultBaseUrl;
  String? _token;

  /// Called when a request comes back 401. It returns a fresh ID token, or null when
  /// the session cannot be renewed (the caller then gets the original 401).
  Future<String?> Function()? _tokenRefresher;
  bool _isRefreshing = false;

  String get baseUrl => _baseUrl;
  String? get token => _token;

  void configure({String? baseUrl, String? token}) {
    if (baseUrl != null && baseUrl.isNotEmpty) {
      _baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), '');
    }
    if (token != null) {
      _token = token;
    }
  }

  void setToken(String? token) {
    _token = token;
  }

  void setTokenRefresher(Future<String?> Function()? refresher) {
    _tokenRefresher = refresher;
  }

  Map<String, String> _headers() {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_token != null && _token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Uri _buildUri(String path) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$_baseUrl$cleanPath');
  }

  /// Runs one request and, if it is rejected because the Firebase ID token expired,
  /// refreshes the token and retries once. A Firebase token only lives an hour, so
  /// without this every write after the first hour looks like "Unauthorized".
  Future<http.Response> _send(Future<http.Response> Function() request) async {
    var response = await request();
    if (response.statusCode != 401 || _tokenRefresher == null || _isRefreshing) {
      return response;
    }
    final refreshed = await _refreshToken();
    if (!refreshed) return response;
    return request();
  }

  Future<bool> _refreshToken() async {
    if (_isRefreshing || _tokenRefresher == null) return false;
    _isRefreshing = true;
    try {
      final token = await _tokenRefresher!.call();
      if (token == null || token.isEmpty) return false;
      _token = token;
      return true;
    } catch (e) {
      debugPrint('[API AUTH REFRESH ERROR] $e');
      return false;
    } finally {
      _isRefreshing = false;
    }
  }

  Future<dynamic> get(String path) async {
    final uri = _buildUri(path);
    debugPrint('[API GET] $uri');
    try {
      final res = await _send(
        () => http.get(uri, headers: _headers()).timeout(const Duration(seconds: 15)),
      );
      return _handleResponse(res);
    } catch (e) {
      debugPrint('[API GET ERROR] $e');
      if (e is ApiException) rethrow;
      throw ApiException(e.toString());
    }
  }

  Future<dynamic> post(String path, {dynamic body}) async {
    final uri = _buildUri(path);
    debugPrint('[API POST] $uri');
    try {
      final res = await _send(
        () => http
            .post(
              uri,
              headers: _headers(),
              body: body != null ? jsonEncode(body) : null,
            )
            .timeout(const Duration(seconds: 25)),
      );
      return _handleResponse(res);
    } catch (e) {
      debugPrint('[API POST ERROR] $e');
      if (e is ApiException) rethrow;
      throw ApiException(e.toString());
    }
  }

  Future<dynamic> put(String path, {dynamic body}) async {
    final uri = _buildUri(path);
    debugPrint('[API PUT] $uri');
    try {
      final res = await _send(
        () => http
            .put(
              uri,
              headers: _headers(),
              body: body != null ? jsonEncode(body) : null,
            )
            .timeout(const Duration(seconds: 25)),
      );
      return _handleResponse(res);
    } catch (e) {
      debugPrint('[API PUT ERROR] $e');
      if (e is ApiException) rethrow;
      throw ApiException(e.toString());
    }
  }

  Future<dynamic> patch(String path, {dynamic body}) async {
    final uri = _buildUri(path);
    debugPrint('[API PATCH] $uri');
    try {
      final res = await _send(
        () => http
            .patch(
              uri,
              headers: _headers(),
              body: body != null ? jsonEncode(body) : null,
            )
            .timeout(const Duration(seconds: 25)),
      );
      return _handleResponse(res);
    } catch (e) {
      debugPrint('[API PATCH ERROR] $e');
      if (e is ApiException) rethrow;
      throw ApiException(e.toString());
    }
  }

  Future<dynamic> delete(String path) async {
    final uri = _buildUri(path);
    debugPrint('[API DELETE] $uri');
    try {
      final res = await _send(
        () => http.delete(uri, headers: _headers()).timeout(const Duration(seconds: 20)),
      );
      return _handleResponse(res);
    } catch (e) {
      debugPrint('[API DELETE ERROR] $e');
      if (e is ApiException) rethrow;
      throw ApiException(e.toString());
    }
  }

  dynamic _handleResponse(http.Response res) {
    dynamic json;
    try {
      if (res.body.isNotEmpty) {
        json = jsonDecode(res.body);
      }
    } catch (_) {
      json = null;
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      // A 200 that is not JSON means the base URL is wrong (an HTML page, a proxy
      // error, a parked domain). Saying so is much better than pretending "no data".
      if (res.body.trim().isNotEmpty && json == null) {
        final looksLikeHtml = res.body.trimLeft().startsWith('<');
        throw ApiException(
          looksLikeHtml
              ? 'The server returned a web page instead of API data. Check the API base URL.'
              : 'The server returned an unreadable response. Check the API base URL.',
          statusCode: res.statusCode,
        );
      }
      return json;
    }

    String errorMsg = 'HTTP ${res.statusCode}';
    if (json is Map) {
      if (json['error'] is String) {
        errorMsg = json['error'];
      } else if (json['error'] is Map && json['error']['issues'] is List) {
        final issues = json['error']['issues'] as List;
        errorMsg = issues.map((i) {
          final path = (i['path'] as List?)?.join('.') ?? 'field';
          final msg = i['message'] ?? 'invalid';
          return '$path: $msg';
        }).join(', ');
      } else if (json['error'] != null) {
        errorMsg = json['error'].toString();
      } else if (json['message'] is String) {
        errorMsg = json['message'];
      }
    } else if (res.reasonPhrase != null && res.reasonPhrase!.isNotEmpty) {
      errorMsg = res.reasonPhrase!;
    }

    throw ApiException(errorMsg, statusCode: res.statusCode, body: json);
  }
}
