import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import '../services/auth_exception.dart';
import '../services/diagnostics_service.dart';

class GoogleSignInResult {
  final String idToken;
  final String? refreshToken;
  final String uid;
  final String? email;
  final String? name;
  final int expiresIn;

  GoogleSignInResult({
    required this.idToken,
    required this.refreshToken,
    required this.uid,
    required this.email,
    required this.name,
    required this.expiresIn,
  });
}

class GoogleAuthService {
  GoogleAuthService({required this.apiBaseUrl});

  final String apiBaseUrl;
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;
  Completer<GoogleSignInResult>? _pending;

  void Function(GoogleSignInResult)? onUnhandledResult;

  Future<void> init() async {
    _subscription ??= _appLinks.uriLinkStream.listen(
      (uri) => _dispatch(uri),
      onError: (Object e, StackTrace st) {
        appDiagnostics.recordMessage('Google sign-in', 'Deep link stream failed: $e');
      },
    );
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) await _dispatch(initial);
    } catch (e) {
      appDiagnostics.recordMessage('Google sign-in', 'Reading the initial link failed: $e');
    }
  }

  Future<GoogleSignInResult> signIn() async {
    final completer = Completer<GoogleSignInResult>();
    _pending = completer;
    final url = Uri.parse(ApiConfig.mobileGoogleLoginUrl(apiBaseUrl));
    appDiagnostics.recordMessage('Google sign-in', 'Opening embedded Chrome at $url');

    bool launched = false;
    try {
      launched = await launchUrl(url, mode: LaunchMode.inAppBrowserView);
    } catch (e) {
      appDiagnostics.recordMessage('Google sign-in', 'Custom Tab launch failed: $e');
    }
    if (!launched) {
      try {
        launched = await launchUrl(url, mode: LaunchMode.externalApplication);
      } catch (e) {
        appDiagnostics.recordMessage('Google sign-in', 'External browser launch failed: $e');
      }
    }
    if (!launched) {
      _pending = null;
      throw AuthException('Could not open a browser window for Google sign-in.');
    }

    try {
      return await completer.future.timeout(
        const Duration(minutes: 5),
        onTimeout: () {
          _pending = null;
          throw AuthException(
            'Google sign-in timed out. Complete the sign-in in Chrome and tap "Open OnlyOrders" if the app does not return.',
          );
        },
      );
    } finally {
      _pending = null;
    }
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  Future<void> _dispatch(Uri uri) async {
    if (uri.scheme != ApiConfig.authCallbackScheme || uri.host != ApiConfig.authCallbackHost) {
      return;
    }
    appDiagnostics.recordMessage('Google sign-in', 'Callback received from Chrome');

    final params = Uri.splitQueryString(uri.fragment);
    final encoded = params['p'];
    if (encoded == null || encoded.isEmpty) {
      final error = params['error'];
      final message = error != null && error.isNotEmpty ? error : 'The page did not send a session.';
      appDiagnostics.recordMessage('Google sign-in', 'Callback missing session: $message');
      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.completeError(AuthException(message));
      }
      return;
    }

    try {
      final normalized = base64Normalize(encoded);
      final decoded = utf8.decode(base64Url.decode(normalized));
      final json = jsonDecode(decoded);
      if (json is! Map) throw const FormatException('Invalid payload');
      final map = Map<String, dynamic>.from(json);
      final idToken = map['idToken']?.toString();
      if (idToken == null || idToken.isEmpty) {
        throw const FormatException('Missing access token');
      }
      final result = GoogleSignInResult(
        idToken: idToken,
        refreshToken: map['refreshToken']?.toString(),
        uid: map['uid']?.toString() ?? '',
        email: map['email']?.toString(),
        name: map['name']?.toString(),
        expiresIn: int.tryParse(map['expiresIn']?.toString() ?? '') ?? 3600,
      );
      if (result.uid.isEmpty) {
        throw const FormatException('Missing user id');
      }

      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.complete(result);
      } else {
        onUnhandledResult?.call(result);
      }
    } catch (e) {
      appDiagnostics.recordMessage('Google sign-in', 'Callback could not be read: $e');
      final completer = _pending;
      if (completer != null && !completer.isCompleted) {
        completer.completeError(AuthException('The Google sign-in response could not be read. Try again.'));
      }
    }
  }

  String base64Normalize(String value) {
    var out = value.replaceAll('-', '+').replaceAll('_', '/');
    while (out.length % 4 != 0) {
      out += '=';
    }
    return out;
  }
}
