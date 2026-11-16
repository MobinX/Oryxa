import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

final AxiomService axiomService = AxiomService.instance;

/// Structured mobile logger streaming diagnostic and crash events directly to Axiom
/// and the backend /api/v1/mobile/logs sink.
class AxiomService {
  static final AxiomService instance = AxiomService._internal();
  AxiomService._internal();

  static const String _prefsPendingKey = 'axiom.pending_events.v1';
  static const int _maxQueueSize = 200;
  static const int _flushBatchSize = 25;
  static const String _defaultDataset = 'app';
  static const String _defaultIngestUrl = 'https://api.axiom.co';

  String _dataset = _defaultDataset;
  String _ingestUrl = _defaultIngestUrl;
  String? _axiomToken;
  String _apiBaseUrl = ApiConfig.defaultBaseUrl;
  bool _enabled = true;
  bool _initialized = false;
  bool _isFlushing = false;

  Timer? _flushTimer;
  final List<Map<String, dynamic>> _queue = [];

  String? _appVersion;

  /// Initializes Axiom config from the backend deployment's mobile config endpoint.
  Future<void> init({String? baseUrl, String? appVersion}) async {
    if (_initialized) return;
    _initialized = true;
    _apiBaseUrl = baseUrl ?? ApiConfig.defaultBaseUrl;
    _appVersion = appVersion;

    // 1. Restore any pending un-flushed events from persistent storage
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsPendingKey);
      if (saved != null && saved.isNotEmpty) {
        final decoded = jsonDecode(saved);
        if (decoded is List) {
          for (final item in decoded) {
            if (item is Map) _queue.add(Map<String, dynamic>.from(item));
          }
        }
      }
    } catch (_) {}

    // 2. Fetch remote Axiom configuration
    try {
      final configUrl = ApiConfig.mobileFirebaseConfigUrl(_apiBaseUrl);
      final res = await http.get(Uri.parse(configUrl)).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(res.body);
        final axiomConfig = data['axiom'];
        if (axiomConfig is Map) {
          _enabled = axiomConfig['enabled'] != false;
          _dataset = axiomConfig['dataset']?.toString() ?? _defaultDataset;
          _ingestUrl = axiomConfig['ingestUrl']?.toString() ?? _defaultIngestUrl;
          final token = axiomConfig['token']?.toString();
          if (token != null && token.isNotEmpty) {
            _axiomToken = token;
          }
        }
      }
    } catch (e) {
      debugPrint('[AxiomService] Config fetch warning: $e');
    }

    // 3. Start auto-flush periodic timer
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(const Duration(seconds: 5), (_) => flush());

    // 4. Send initial boot event
    info(
      'Flutter application booted',
      tag: 'APP_LIFECYCLE',
      metadata: {
        'platform': Platform.operatingSystem,
        'os_version': Platform.operatingSystemVersion,
        'app_version': _appVersion ?? 'unknown',
      },
    );

    // Initial flush if anything was queued
    if (_queue.isNotEmpty) {
      unawaited(flush());
    }
  }

  void info(String message, {String? tag, Map<String, dynamic>? metadata}) {
    log('info', message, tag: tag, metadata: metadata);
  }

  void warn(String message, {String? tag, Map<String, dynamic>? metadata}) {
    log('warning', message, tag: tag, metadata: metadata);
  }

  void error(
    String message, {
    Object? error,
    StackTrace? stack,
    String? tag,
    Map<String, dynamic>? metadata,
  }) {
    log(
      'error',
      message,
      tag: tag ?? 'ERROR',
      error: error,
      stack: stack,
      metadata: metadata,
      flushImmediately: true,
    );
  }

  void critical(
    String message, {
    Object? error,
    StackTrace? stack,
    String? tag,
    Map<String, dynamic>? metadata,
  }) {
    log(
      'critical',
      message,
      tag: tag ?? 'CRITICAL',
      error: error,
      stack: stack,
      metadata: metadata,
      flushImmediately: true,
    );
  }

  void logNotificationEvent(
    String eventName, {
    required String title,
    required String body,
    Map<String, dynamic>? data,
    Object? error,
    StackTrace? stack,
  }) {
    final isError = error != null;
    log(
      isError ? 'error' : 'info',
      '[Notification] $eventName: $title',
      tag: 'FCM_NOTIFICATION',
      error: error,
      stack: stack,
      metadata: {
        'event': eventName,
        'title': title,
        'body': body,
        if (data != null) 'data': data,
      },
      flushImmediately: isError,
    );
  }

  /// Appends an event to the queue and triggers an immediate flush if required.
  void log(
    String level,
    String message, {
    String? tag,
    Object? error,
    StackTrace? stack,
    Map<String, dynamic>? metadata,
    bool flushImmediately = false,
  }) {
    if (!_enabled) return;

    final timestamp = DateTime.now().toUtc().toIso8601String();
    final entry = <String, dynamic>{
      '_time': timestamp,
      'time': timestamp,
      'evt': 'mobile_log',
      'level': level,
      'message': message,
      'platform': 'android',
      'app_version': _appVersion ?? 'unknown',
      if (tag != null) 'tag': tag,
      if (error != null) 'error': error.toString(),
      if (stack != null) 'stack': stack.toString(),
      if (metadata != null) ...metadata,
    };

    debugPrint('[Axiom][${level.toUpperCase()}] $message');

    _queue.add(entry);
    while (_queue.length > _maxQueueSize) {
      _queue.removeAt(0);
    }

    if (flushImmediately || _queue.length >= _flushBatchSize) {
      unawaited(flush());
    }
  }

  /// Flushes queued events directly to Axiom HTTP Ingest API, falling back to backend relay.
  Future<void> flush() async {
    if (_isFlushing || _queue.isEmpty) return;
    _isFlushing = true;

    final toSend = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();

    bool sent = false;

    // 1. Try sending directly to Axiom Ingest API if token is available
    if (_axiomToken != null && _axiomToken!.isNotEmpty) {
      try {
        final uri = Uri.parse('$_ingestUrl/v1/datasets/$_dataset/ingest');
        final response = await http
            .post(
              uri,
              headers: {
                'Authorization': 'Bearer $_axiomToken',
                'Content-Type': 'application/json',
              },
              body: jsonEncode(toSend),
            )
            .timeout(const Duration(seconds: 10));

        if (response.statusCode >= 200 && response.statusCode < 300) {
          sent = true;
        } else {
          debugPrint('[AxiomService] Direct Axiom ingest status: ${response.statusCode} ${response.body}');
        }
      } catch (e) {
        debugPrint('[AxiomService] Direct Axiom ingest error: $e');
      }
    }

    // 2. Fallback to API relay endpoint: POST /api/v1/mobile/logs
    if (!sent) {
      try {
        final relayUrl = Uri.parse('$_apiBaseUrl/mobile/logs');
        final response = await http
            .post(
              relayUrl,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'events': toSend}),
            )
            .timeout(const Duration(seconds: 10));

        if (response.statusCode >= 200 && response.statusCode < 300) {
          sent = true;
        }
      } catch (e) {
        debugPrint('[AxiomService] Backend relay error: $e');
      }
    }

    // 3. If transmission failed, re-queue errors and persist to disk for next time
    if (!sent) {
      final keepErrors = toSend
          .where((e) => e['level'] == 'error' || e['level'] == 'critical')
          .take(30)
          .toList();
      _queue.insertAll(0, keepErrors);

      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefsPendingKey, jsonEncode(keepErrors));
      } catch (_) {}
    } else {
      // Clear persisted entries once successfully shipped
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_prefsPendingKey);
      } catch (_) {}
    }

    _isFlushing = false;
  }
}
