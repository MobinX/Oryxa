import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One failure kept so the Diagnostics screen can show it after the snackbar is
/// gone (or after a button appeared to do nothing) — and after a restart.
@immutable
class DiagnosticEntry {
  final DateTime at;
  final String scope;
  final String message;
  final String? details;

  const DiagnosticEntry({
    required this.at,
    required this.scope,
    required this.message,
    this.details,
  });

  String get timeLabel {
    final h = at.hour.toString().padLeft(2, '0');
    final m = at.minute.toString().padLeft(2, '0');
    final s = at.second.toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  Map<String, dynamic> toJson() => {
        'at': at.toIso8601String(),
        'scope': scope,
        'message': message,
        if (details != null) 'details': details,
      };

  static DiagnosticEntry? fromJson(Map<String, dynamic> json) {
    final at = DateTime.tryParse(json['at']?.toString() ?? '');
    final scope = json['scope']?.toString();
    final message = json['message']?.toString();
    if (at == null || scope == null || message == null) return null;
    return DiagnosticEntry(
      at: at,
      scope: scope,
      message: message,
      details: json['details']?.toString(),
    );
  }
}

/// A deliberately small error log. Every swallowed provider exception, failed
/// button and Flutter build error lands here, so "nothing happened" always has
/// an explanation the merchant can read and copy. Entries survive restarts.
class DiagnosticsService extends ChangeNotifier {
  static const int _maxEntries = 100;
  static const String _prefsKey = 'diagnostics.entries.v1';
  static const int _maxDetailsChars = 4000;

  final List<DiagnosticEntry> _entries = [];
  bool _loaded = false;

  List<DiagnosticEntry> get entries => List.unmodifiable(_entries);
  bool get isEmpty => _entries.isEmpty;
  bool get isLoaded => _loaded;

  /// Restores the previous session's failures. Safe to call before runApp.
  Future<void> loadPersisted() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          _entries
            ..clear()
            ..addAll(
              decoded
                  .whereType<Map>()
                  .map((m) => DiagnosticEntry.fromJson(m.cast<String, dynamic>()))
                  .whereType<DiagnosticEntry>(),
            );
        }
      }
    } catch (e) {
      debugPrint('[Diagnostics] Could not restore the saved log: $e');
    }
    _loaded = true;
    notifyListeners();
  }

  void record(String scope, Object error, [StackTrace? stack]) {
    _add(
      scope: scope,
      message: error.toString(),
      details: stack?.toString(),
    );
  }

  void recordMessage(String scope, String message, {String? details}) {
    _add(scope: scope, message: message, details: details);
  }

  void _add({required String scope, required String message, String? details}) {
    final trimmedDetails = details != null && details.length > _maxDetailsChars
        ? '${details.substring(0, _maxDetailsChars)}\n…truncated'
        : details;
    _entries.insert(
      0,
      DiagnosticEntry(
        at: DateTime.now(),
        scope: scope,
        message: message,
        details: trimmedDetails,
      ),
    );
    if (_entries.length > _maxEntries) {
      _entries.removeRange(_maxEntries, _entries.length);
    }
    debugPrint('[Diagnostics][$scope] $message');
    notifyListeners();
    _persist();
  }

  void clear() {
    _entries.clear();
    notifyListeners();
    _persist();
  }

  void _persist() {
    final payload = jsonEncode(_entries.map((e) => e.toJson()).toList());
    unawaited(
      SharedPreferences.getInstance()
          .then((prefs) => prefs.setString(_prefsKey, payload))
          .catchError((Object e) {
        debugPrint('[Diagnostics] Could not save the log: $e');
        return false;
      }),
    );
  }
}

/// App-wide instance: `main()` installs the Flutter error hook before the widget
/// tree exists, and every screen records into the same log.
final DiagnosticsService appDiagnostics = DiagnosticsService();
