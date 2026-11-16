import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../config/app_theme.dart';
import 'api_service.dart';
import 'diagnostics_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    WidgetsFlutterBinding.ensureInitialized();
    final data = message.data;
    final notification = message.notification;
    final title = notification?.title ?? data['title'] ?? 'OnlyOrders Alert';
    final body = notification?.body ?? data['body'] ?? '';

    if (title.isNotEmpty || body.isNotEmpty) {
      final localNotifications = FlutterLocalNotificationsPlugin();
      const androidDetails = AndroidNotificationDetails(
        'high_importance_channel',
        'Order & Customer Alerts',
        channelDescription: 'Notifications for new customer orders, urgent help requests, and sales updates.',
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        playSound: true,
        enableVibration: true,
      );
      await localNotifications.show(
        id: message.hashCode,
        title: title,
        body: body,
        notificationDetails: const NotificationDetails(android: androidDetails),
        payload: data['link']?.toString(),
      );
    }
  } catch (e) {
    debugPrint('[NotificationService] Background message error: $e');
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

    // Initialize local notifications plugin
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
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

    // Initialize Firebase Core dynamically from web config if not already initialized
    await _ensureFirebaseInitialized(apiService);

    if (_firebaseInitialized) {
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

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
    }
  }

  Future<void> _ensureFirebaseInitialized(ApiService apiService) async {
    if (_firebaseInitialized) return;
    if (Firebase.apps.isNotEmpty) {
      _firebaseInitialized = true;
      return;
    }

    try {
      final configUrl = ApiConfig.mobileFirebaseConfigUrl(apiService.baseUrl);
      final res = await http.get(Uri.parse(configUrl)).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final Map<String, dynamic> config = jsonDecode(res.body);
        final apiKey = config['apiKey']?.toString() ?? '';
        final appId = config['appId']?.toString() ?? '';
        final messagingSenderId = config['messagingSenderId']?.toString() ?? '';
        final projectId = config['projectId']?.toString() ?? '';
        final storageBucket = config['storageBucket']?.toString();

        if (apiKey.isNotEmpty && appId.isNotEmpty && projectId.isNotEmpty) {
          await Firebase.initializeApp(
            options: FirebaseOptions(
              apiKey: apiKey,
              appId: appId,
              messagingSenderId: messagingSenderId,
              projectId: projectId,
              storageBucket: storageBucket,
            ),
          );
          _firebaseInitialized = true;
          appDiagnostics.record('FCM', 'Firebase initialized successfully with project $projectId');
        }
      }
    } catch (e) {
      appDiagnostics.record('FCM init error', e);
      debugPrint('[NotificationService] Firebase init error: $e');
    }
  }

  Future<String?> getDeviceToken(ApiService apiService) async {
    if (_fcmToken != null && _fcmToken!.isNotEmpty) return _fcmToken;
    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return null;
    try {
      _fcmToken = await FirebaseMessaging.instance.getToken();
      return _fcmToken;
    } catch (e) {
      debugPrint('[NotificationService] getToken error: $e');
      return null;
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final data = message.data;
    final notification = message.notification;
    final title = notification?.title ?? data['title'] ?? 'OnlyOrders Alert';
    final body = notification?.body ?? data['body'] ?? '';

    if (title.isEmpty && body.isEmpty) return;

    final androidDetails = AndroidNotificationDetails(
      'high_importance_channel',
      'Order & Customer Alerts',
      channelDescription: 'Notifications for new customer orders, urgent help requests, and sales updates.',
      importance: Importance.max,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      playSound: true,
      enableVibration: true,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
      ),
    );

    await _localNotifications.show(
      id: message.hashCode,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(android: androidDetails),
      payload: data['link']?.toString(),
    );
  }

  /// Shows the pre-permission explanation dialog if not prompted yet, then requests OS permission.
  Future<void> showPermissionDialogIfNeeded(
    BuildContext context, {
    required ApiService apiService,
    required List<String> businessIds,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final alreadyShown = prefs.getBool(_prefDialogShown) ?? false;

    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return;

    NotificationSettings currentSettings;
    try {
      currentSettings = await FirebaseMessaging.instance.getNotificationSettings();
    } catch (_) {
      return;
    }

    if (currentSettings.authorizationStatus == AuthorizationStatus.authorized) {
      // Already authorized: sync subscriptions silently
      await syncSubscriptions(apiService, businessIds);
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
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      final isAuthorized = settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;

      if (isAuthorized) {
        await syncSubscriptions(apiService, businessIds);
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[NotificationService] requestPermission error: $e');
      return false;
    }
  }

  /// Subscribes FCM token and topic for all user businesses when logged in.
  Future<void> syncSubscriptions(ApiService apiService, List<String> businessIds) async {
    if (businessIds.isEmpty) return;
    final token = await getDeviceToken(apiService);
    if (token == null || token.isEmpty) return;

    for (final bId in businessIds) {
      if (bId.isEmpty) continue;
      try {
        await apiService.post(
          ApiConfig.pathBusinessPushSubscribe(bId),
          body: {'token': token},
        );
        _subscribedBusinessIds.add(bId);
        try {
          await FirebaseMessaging.instance.subscribeToTopic('business_$bId');
        } catch (_) {}
      } catch (e) {
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
