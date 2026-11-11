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

class ApiService {
  String _baseUrl = ApiConfig.defaultBaseUrl;
  String? _token;

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

  Future<dynamic> get(String path) async {
    final uri = _buildUri(path);
    debugPrint('[API GET] $uri');
    try {
      final res = await http.get(uri, headers: _headers()).timeout(const Duration(seconds: 15));
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
      final res = await http
          .post(
            uri,
            headers: _headers(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 25));
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
      final res = await http
          .put(
            uri,
            headers: _headers(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 25));
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
      final res = await http
          .patch(
            uri,
            headers: _headers(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 25));
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
      final res = await http.delete(uri, headers: _headers()).timeout(const Duration(seconds: 20));
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
