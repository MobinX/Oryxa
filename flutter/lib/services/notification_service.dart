import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../config/app_theme.dart';
import 'api_service.dart';
import 'axiom_service.dart';
import 'diagnostics_service.dart';
import '../widgets/app_feedback.dart';

/// Background FCM handler — runs in a SEPARATE Dart isolate spawned by Android.
/// RULES for this isolate:
///   1. Must be a top-level function annotated @pragma('vm:entry-point').
///   2. No access to main isolate singletons (axiomService, appDiagnostics, etc.)
///      — each is re-instantiated fresh in the new isolate.
///   3. WidgetsFlutterBinding.ensureInitialized() MUST be called first.
///   4. When message.notification != null, Android FCM service displays the
///      system-tray notification automatically — do NOT create a duplicate.
///   5. Keep this function as lean as possible. Any unhandled exception here
///      terminates the background isolate and swallows the notification silently.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Step 1: initialise bindings (required for all plugin calls in background isolate)
  WidgetsFlutterBinding.ensureInitialized();

  final notification = message.notification;
  final data = message.data;

  // Step 2: If a notification payload exists, Android FCM already shows it in
  // the status bar automatically — log and return to avoid a duplicate.
  if (notification != null) {
    debugPrint(
      '[FCM-BG] System displayed background push: ${notification.title}',
    );
    return;
  }

  // Step 3: Data-only message — manually show a local notification.
  final title = data['title']?.toString() ?? 'OnlyOrders Alert';
  final body = data['body']?.toString() ?? '';
  if (title.isEmpty && body.isEmpty) return;

  try {
    final localNotifications = FlutterLocalNotificationsPlugin();
    const androidInit = AndroidInitializationSettings('ic_notification');
    await localNotifications.initialize(
      settings: const InitializationSettings(android: androidInit),
    );

    const androidDetails = AndroidNotificationDetails(
      'high_importance_channel',
      'Order & Customer Alerts',
      channelDescription:
          'Notifications for new customer orders, urgent help requests, and sales updates.',
      importance: Importance.max,
      priority: Priority.high,
      icon: 'ic_notification',
      largeIcon: DrawableResourceAndroidBitmap('ic_launcher'),
      color: Color(0xFF5B3DF5), // AppTheme.primaryColor — inline to avoid import chain
      playSound: true,
      enableVibration: true,
    );

    final notificationId =
        (message.messageId?.hashCode ?? message.hashCode) & 0x7FFFFFFF;
    await localNotifications.show(
      id: notificationId,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(android: androidDetails),
      payload: data['link']?.toString(),
    );

    debugPrint('[FCM-BG] Data-only notification displayed: $title');
  } catch (e, st) {
    debugPrint('[FCM-BG] Failed to show data-only notification: $e\n$st');
  }
}

class NotificationService {
  static final NotificationService instance = NotificationService._internal();
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  bool _firebaseInitialized = false;
  String? _fcmToken;
  final Set<String> _subscribedBusinessIds = <String>{};

  static const String _prefDialogShown = 'fcm_permission_dialog_shown';
  static const String _prefSubscribedBiz = 'fcm_subscribed_business_ids';

  /// Navigation callback when a notification is clicked.
  void Function(String link)? onNotificationClicked;

  Future<void> init(ApiService apiService) async {
    if (_initialized) return;
    _initialized = true;

    // Load persisted subscribed businesses
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getStringList(_prefSubscribedBiz);
      if (saved != null) _subscribedBusinessIds.addAll(saved);
    } catch (_) {}

    // Initialize local notifications plugin safely
    try {
      const androidInit = AndroidInitializationSettings('ic_notification');
      const initSettings = InitializationSettings(android: androidInit);
      await _localNotifications.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse response) {
          final payload = response.payload;
          if (payload != null && payload.isNotEmpty) {
            onNotificationClicked?.call(payload);
          }
        },
      );

      // Create high importance Android notification channel
      const channel = AndroidNotificationChannel(
        'high_importance_channel',
        'Order & Customer Alerts',
        description: 'Notifications for new customer orders, urgent help requests, and sales updates.',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
    } catch (e) {
      debugPrint('[NotificationService] Local notifications init skipped: $e');
    }

    // Initialize Firebase Core dynamically from web config if not already initialized
    await _ensureFirebaseInitialized(apiService);

    // Register Firebase Messaging listeners unconditionally
    try {
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    } catch (e) {
      debugPrint('[NotificationService] onBackgroundMessage registration error: $e');
    }

    try {
      // On Android, FCM foreground messages are suppressed by the native SDK when
      // notification payload is present — override so our local notifications plugin
      // always handles display (required to show heads-up banners in foreground).
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: false,
        sound: true,
      );
    } catch (e) {
      debugPrint('[NotificationService] setForegroundNotificationPresentationOptions error: $e');
    }

    try {
      // Listen for foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        _showForegroundNotification(message);
      });

      // Notification opened app from background
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        final link = message.data['link']?.toString();
        if (link != null && link.isNotEmpty) {
          onNotificationClicked?.call(link);
        }
      });

      // Handle terminated launch
      FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
        if (message != null) {
          final link = message.data['link']?.toString();
          if (link != null && link.isNotEmpty) {
            onNotificationClicked?.call(link);
          }
        }
      });

      // Token refresh listener
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        _fcmToken = newToken;
        if (_subscribedBusinessIds.isNotEmpty) {
          syncSubscriptions(apiService, _subscribedBusinessIds.toList());
        }
      });

      axiomService.info('FCM message listeners registered successfully', tag: 'FCM_LISTENERS');
    } catch (e, st) {
      axiomService.error(
        'FCM listener registration error: $e',
        error: e,
        stack: st,
        tag: 'FCM_LISTENERS_ERROR',
      );
    }
  }

  Future<void> _ensureFirebaseInitialized(ApiService apiService) async {
    if (_firebaseInitialized) return;
    if (Firebase.apps.isNotEmpty) {
      _firebaseInitialized = true;
      return;
    }

    // 1. Try initializing with native options (reads google-services.json on Android automatically)
    try {
      await Firebase.initializeApp();
      _firebaseInitialized = true;
      axiomService.info('Firebase initialized natively via google-services', tag: 'FCM');
      return;
    } catch (e) {
      if (e.toString().contains('duplicate-app') || Firebase.apps.isNotEmpty) {
        _firebaseInitialized = true;
        axiomService.info('Firebase already initialized natively', tag: 'FCM');
        return;
      }
      debugPrint('[NotificationService] Native initializeApp skipped: $e');
    }

    // 2. Fallback: fetch remote config
    try {
      final configUrl = ApiConfig.mobileFirebaseConfigUrl(apiService.baseUrl);
      final res = await http.get(Uri.parse(configUrl)).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final Map<String, dynamic> config = jsonDecode(res.body);
        final apiKey = config['apiKey']?.toString() ?? '';
        final appId = (Platform.isAndroid ? (config['androidAppId'] ?? config['appId']) : config['appId'])?.toString() ?? '';
        final messagingSenderId = config['messagingSenderId']?.toString() ?? '';
        final projectId = config['projectId']?.toString() ?? '';
        final storageBucket = config['storageBucket']?.toString();

        if (apiKey.isNotEmpty && appId.isNotEmpty && projectId.isNotEmpty) {
          try {
            await Firebase.initializeApp(
              options: FirebaseOptions(
                apiKey: apiKey,
                appId: appId,
                messagingSenderId: messagingSenderId,
                projectId: projectId,
                storageBucket: storageBucket,
              ),
            );
          } catch (e) {
            if (!e.toString().contains('duplicate-app')) rethrow;
          }
          _firebaseInitialized = true;
          axiomService.info(
            'Firebase initialized successfully with project $projectId ($appId)',
            tag: 'FCM',
          );
          appDiagnostics.record('FCM', 'Firebase initialized successfully with project $projectId');
        }
      }
    } catch (e, st) {
      if (e.toString().contains('duplicate-app') || Firebase.apps.isNotEmpty) {
        _firebaseInitialized = true;
      } else {
        axiomService.error(
          'Firebase init error: $e',
          error: e,
          stack: st,
          tag: 'FCM_INIT_ERROR',
        );
        appDiagnostics.record('FCM init error', e);
        debugPrint('[NotificationService] Firebase init error: $e');
      }
    }
  }

  Future<String?> getDeviceToken(ApiService apiService) async {
    if (_fcmToken != null && _fcmToken!.isNotEmpty) return _fcmToken;
    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return null;
    try {
      _fcmToken = await FirebaseMessaging.instance.getToken();
      if (_fcmToken != null && _fcmToken!.isNotEmpty) {
        axiomService.info(
          'FCM device token obtained successfully',
          tag: 'FCM_TOKEN',
          metadata: {'token_prefix': _fcmToken!.substring(0, 15)},
        );
      }
      return _fcmToken;
    } catch (e, st) {
      axiomService.error(
        'FCM getToken error: $e',
        error: e,
        stack: st,
        tag: 'FCM_TOKEN_ERROR',
      );
      debugPrint('[NotificationService] getToken error: $e');
      return null;
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final data = message.data;
    final notification = message.notification;
    final title = notification?.title ?? data['title']?.toString() ?? 'OnlyOrders Alert';
    final body = notification?.body ?? data['body']?.toString() ?? '';

    try {
      axiomService.logNotificationEvent(
        'foreground_received',
        title: title,
        body: body,
        data: data,
      );
    } catch (_) {}

    if (title.isEmpty && body.isEmpty) return;

    // Haptic & audio alert
    try {
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.alert);
    } catch (_) {}

    // In-app snack feedback with link navigation
    try {
      final link = data['link']?.toString();
      showAppSnack(
        '🔔 $title${body.isNotEmpty ? ': $body' : ''}',
        action: (link != null && link.isNotEmpty)
            ? SnackBarAction(
                label: 'VIEW',
                textColor: Colors.white,
                onPressed: () {
                  onNotificationClicked?.call(link);
                },
              )
            : null,
      );
    } catch (e) {
      debugPrint('[NotificationService] showAppSnack error: $e');
    }

    try {
      axiomService.info(
        'Foreground notification displayed: $title',
        tag: 'NOTIFICATION_FG',
        metadata: {'title': title},
      );
    } catch (_) {}
  }

  /// Shows the pre-permission explanation dialog if not prompted yet, then requests OS permission.
  Future<void> showPermissionDialogIfNeeded(
    BuildContext context, {
    required ApiService apiService,
    required List<String> businessIds,
  }) async {
    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return;

    // Always ensure device token is synced with the backend for user's businesses
    unawaited(syncSubscriptions(apiService, businessIds));

    final prefs = await SharedPreferences.getInstance();
    final alreadyShown = prefs.getBool(_prefDialogShown) ?? false;

    // Check if OS notifications are enabled
    NotificationSettings currentSettings;
    try {
      currentSettings = await FirebaseMessaging.instance.getNotificationSettings();
    } catch (_) {
      return;
    }

    if (currentSettings.authorizationStatus == AuthorizationStatus.authorized) {
      return;
    }

    if (alreadyShown || !context.mounted) return;

    // Show custom explanation dialog
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.notifications_active_rounded,
                color: AppTheme.primaryColor,
                size: 36,
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Never Miss an Order',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold, letterSpacing: -0.3),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'Receive instant alerts on your notification bar when a customer places an order or needs your human attention.',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700, height: 1.45),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      prefs.setBool(_prefDialogShown, true);
                      Navigator.of(ctx).pop();
                    },
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      side: BorderSide(color: Colors.grey.shade300),
                    ),
                    child: Text('Not Now', style: TextStyle(color: Colors.grey.shade700)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      prefs.setBool(_prefDialogShown, true);
                      Navigator.of(ctx).pop();
                      await requestPermissionAndSubscribe(
                        apiService: apiService,
                        businessIds: businessIds,
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Enable Alerts', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Requests OS notification permission and registers FCM tokens for businesses if granted.
  Future<bool> requestPermissionAndSubscribe({
    required ApiService apiService,
    required List<String> businessIds,
  }) async {
    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return false;

    try {
      // 1. Android 13+ POST_NOTIFICATIONS via local notifications plugin
      try {
        final androidPlugin = _localNotifications
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        await androidPlugin?.requestNotificationsPermission();
      } catch (_) {}

      // 2. Firebase messaging permission
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      axiomService.info(
        'Notification permission requested: status=${settings.authorizationStatus}',
        tag: 'FCM_PERMISSION',
      );

      await syncSubscriptions(apiService, businessIds);
      return settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
    } catch (e, st) {
      axiomService.error(
        'requestPermission error: $e',
        error: e,
        stack: st,
        tag: 'FCM_PERMISSION_ERROR',
      );
      debugPrint('[NotificationService] requestPermission error: $e');
      return false;
    }
  }

  /// Subscribes FCM token and topic for all user businesses when logged in.
  Future<void> syncSubscriptions(ApiService apiService, List<String> businessIds) async {
    if (businessIds.isEmpty) return;
    final token = await getDeviceToken(apiService);
    if (token == null || token.isEmpty) {
      axiomService.warn('Cannot sync subscriptions: device token is null/empty', tag: 'FCM_SYNC');
      return;
    }

    for (final bId in businessIds) {
      if (bId.isEmpty) continue;
      try {
        await apiService.post(
          ApiConfig.pathBusinessPushSubscribe(bId),
          body: {'token': token},
        );
        _subscribedBusinessIds.add(bId);
        axiomService.info(
          'Successfully registered FCM device token for business $bId',
          tag: 'FCM_SUBSCRIBE',
          metadata: {'businessId': bId},
        );
        try {
          await FirebaseMessaging.instance.subscribeToTopic('business_$bId');
        } catch (_) {}
      } catch (e, st) {
        axiomService.error(
          'Failed to subscribe $bId to push: $e',
          error: e,
          stack: st,
          tag: 'FCM_SUBSCRIBE_ERROR',
        );
        debugPrint('[NotificationService] Failed to subscribe $bId: $e');
      }
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_prefSubscribedBiz, _subscribedBusinessIds.toList());
    } catch (_) {}
  }

  /// Unsubscribes from all businesses and forgets the device token on logout.
  Future<void> onUserLoggedOut(ApiService apiService, [List<String>? businessIds]) async {
    final token = _fcmToken ?? await getDeviceToken(apiService);
    final toUnsubscribe = (businessIds != null && businessIds.isNotEmpty)
        ? businessIds
        : _subscribedBusinessIds.toList();

    if (token != null && token.isNotEmpty) {
      for (final bId in toUnsubscribe) {
        if (bId.isEmpty) continue;
        try {
          await apiService.post(
            ApiConfig.pathBusinessPushUnsubscribe(bId),
            body: {'token': token},
          );
        } catch (_) {}
        try {
          await FirebaseMessaging.instance.unsubscribeFromTopic('business_$bId');
        } catch (_) {}
      }

      try {
        await apiService.post(
          ApiConfig.pathGlobalPushUnsubscribe,
          body: {'token': token},
        );
      } catch (_) {}
    }

    _subscribedBusinessIds.clear();
    _fcmToken = null;

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefSubscribedBiz);
    } catch (_) {}
  }
}
