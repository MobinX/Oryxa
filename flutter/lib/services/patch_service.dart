import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_patcher/flutter_patcher.dart';
import 'package:http/http.dart' as http;

import 'diagnostics_service.dart';

class PatchService extends ChangeNotifier {
  static const String defaultWorkerUrl =
      'https://oryxa-flutter-patch-worker.mobin-devx.workers.dev';

  String _workerUrl = defaultWorkerUrl;
  bool _isChecking = false;
  String _status = 'Idle. Ready to check for remote patches.';
  final List<String> _logs = [];

  bool _restartRequired = false;
  bool _bootCheckDone = false;

  String get workerUrl => _workerUrl;
  bool get isChecking => _isChecking;
  String get status => _status;
  List<String> get logs => List.unmodifiable(_logs);
  bool get restartRequired => _restartRequired;

  void setWorkerUrl(String url) {
    _workerUrl = url.replaceAll(RegExp(r'/+$'), '');
    notifyListeners();
  }

  void _log(String msg) {
    final timestamp = DateTime.now().toIso8601String().substring(11, 19);
    _logs.add('[$timestamp] $msg');
    _status = msg;
    debugPrint('[PatchService] $msg');
    notifyListeners();
  }

  /// Called once per process after the first frame. Without this the published
  /// OTA patch is only installed when a merchant opens this screen and taps the
  /// button, so fixes never reach the device on their own.
  Future<void> autoCheckOnBoot() async {
    if (_bootCheckDone) return;
    _bootCheckDone = true;
    try {
      await Future<void>.delayed(const Duration(seconds: 4));
      await checkForUpdates();
    } catch (e, stack) {
      appDiagnostics.record('Patch boot check', e, stack);
    }
  }

  Future<void> checkForUpdates({bool force = false}) async {
    if (_isChecking) return;
    _isChecking = true;
    notifyListeners();

    _log('Checking for remote updates from Worker at: $_workerUrl');

    try {
      final uri = Uri.parse('$_workerUrl/manifest.json');
      _log('Fetching manifest: $uri');

      final res = await http.get(uri).timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) {
        _log('Failed: Server responded with HTTP ${res.statusCode}');
        appDiagnostics.recordMessage(
          'Patch check',
          'Manifest request failed: HTTP ${res.statusCode}',
        );
        _isChecking = false;
        notifyListeners();
        return;
      }

      final Map<String, dynamic> manifest = jsonDecode(res.body);
      final hasUpdate = manifest['has_update'] == true;
      final patchVersion = manifest['version']?.toString() ?? 'unknown';
      final patchUrl = manifest['patch_url']?.toString() ?? '';
      final expectedMd5 = manifest['md5']?.toString() ?? '';

      _log('Manifest loaded: version=$patchVersion, has_update=$hasUpdate');

      // A patch only loads on the APK version code it was built against. Check
      // that before downloading 24 MB that the boot loader will discard.
      final manifestTargetVersionCode = manifest['target_version_code'] is int
          ? manifest['target_version_code'] as int
          : int.tryParse(manifest['target_version_code']?.toString() ?? '');
      if (manifestTargetVersionCode != null) {
        try {
          final boot = await FlutterPatcher.lastBootDiagnostic;
          final appVersionCode = boot?.appVersionCode;
          if (appVersionCode != null && appVersionCode != manifestTargetVersionCode) {
            _log(
              'Patch $patchVersion targets APK version code '
              '$manifestTargetVersionCode, but this APK is $appVersionCode. '
              'A native rebuild is required; nothing downloaded.',
            );
            appDiagnostics.recordMessage(
              'Patch check',
              'Patch $patchVersion targets APK $manifestTargetVersionCode but '
                  'this APK is $appVersionCode, so it cannot load',
            );
            _isChecking = false;
            notifyListeners();
            return;
          }
        } catch (e) {
          appDiagnostics.record('Patch boot status', e);
        }
      }

      if (!force) {
        try {
          final installed = await FlutterPatcher.currentVersion;
          if (installed != null && installed == patchVersion) {
            _log('Already on patch $installed. Nothing to download.');
            _isChecking = false;
            notifyListeners();
            return;
          }
        } catch (e) {
          appDiagnostics.record('Patch version', e);
        }
      }

      if (!hasUpdate || patchUrl.isEmpty) {
        _log('No new updates available. App is on latest baseline.');
        _isChecking = false;
        notifyListeners();
        return;
      }

      // Resolve full download URL
      final downloadUrl = patchUrl.startsWith('http')
          ? patchUrl
          : '$_workerUrl${patchUrl.startsWith('/') ? patchUrl : '/$patchUrl'}';

      _log('Downloading patch archive: $downloadUrl');
      final patchRes = await http.get(Uri.parse(downloadUrl)).timeout(const Duration(seconds: 30));

      if (patchRes.statusCode != 200) {
        _log('Download failed: HTTP ${patchRes.statusCode}');
        appDiagnostics.recordMessage(
          'Patch download',
          'Download failed: HTTP ${patchRes.statusCode}',
        );
        _isChecking = false;
        notifyListeners();
        return;
      }

      final bytes = patchRes.bodyBytes;
      _log('Downloaded ${(bytes.length / 1024).toStringAsFixed(1)} KB patch file');

      // Verify MD5 checksum
      if (expectedMd5.isNotEmpty) {
        final computedMd5 = md5.convert(bytes).toString();
        if (computedMd5.toLowerCase() != expectedMd5.toLowerCase()) {
          _log('Security Error: MD5 mismatch! expected=$expectedMd5, computed=$computedMd5');
          appDiagnostics.recordMessage(
            'Patch download',
            'MD5 mismatch: expected $expectedMd5, got $computedMd5',
          );
          _isChecking = false;
          notifyListeners();
          return;
        }
        _log('✓ MD5 Checksum verified successfully');
      }

      final targetVersionCode = manifest['target_version_code'] is int
          ? manifest['target_version_code'] as int
          : int.tryParse(manifest['target_version_code']?.toString() ?? '');

      _log('Applying patch via FlutterPatcher...');
      try {
        await FlutterPatcher.applyPatchBytes(
          bytes,
          version: patchVersion,
          targetVersionCode: targetVersionCode,
        );
        _restartRequired = true;
        _log('🎉 Patch v$patchVersion applied! Restart app to load updated code.');
        appDiagnostics.recordMessage(
          'Patch apply',
          'Patch $patchVersion installed; restart required to load it',
        );
      } catch (err) {
        _log('FlutterPatcher install notice: $err');
        appDiagnostics.record('Patch install', err);
      }
    } catch (e) {
      _log('Error checking updates: $e');
      appDiagnostics.record('Patch check', e);
    } finally {
      _isChecking = false;
      notifyListeners();
    }
  }
}
