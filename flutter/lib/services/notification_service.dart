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
  bool _adminMailPush = false;
  bool _pendingUnsubscribe = false;
  bool _pendingAdminUnsubscribe = false;
  Timer? _unsubscribeRetryTimer;

  static const String _prefDialogShown = 'fcm_permission_dialog_shown';
  static const String _prefSubscribedBiz = 'fcm_subscribed_business_ids';
  static const String _prefAdminMailPush = 'fcm_admin_mail_push';
  static const String _prefPendingUnsubscribe = 'fcm_pending_unsubscribe';
  static const String _prefPendingAdminUnsubscribe = 'fcm_pending_admin_unsubscribe';

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
      _pendingUnsubscribe = prefs.getBool(_prefPendingUnsubscribe) ?? false;
      _pendingAdminUnsubscribe = prefs.getBool(_prefPendingAdminUnsubscribe) ?? false;
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
        // An FCM registration can rotate at any time. Re-bind the mail alert to the
        // new token, otherwise the Worker keeps sending to a dead registration.
        if (_adminMailPush) {
          unawaited(requestAdminMailPush(apiService, requestPermission: false));
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

    // A saved admin session renews its inbox alerts silently. No permission dialog on
    // boot: the prompt belongs to signing in, and a denied browser is simply skipped.
    unawaited(restoreAdminMailPush(apiService));

    // A logout whose unsubscribe failed must not leave a device registered
    // forever. Retry in the background until the server confirms removal.
    unawaited(_retryPendingUnsubscribes(apiService));
    _unsubscribeRetryTimer?.cancel();
    _unsubscribeRetryTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      unawaited(_retryPendingUnsubscribes(apiService));
    });
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

  Future<bool> _hasActiveSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final type = prefs.getString(ApiConfig.storageKeyUserSessionType);
      if (type == 'admin') {
        return (prefs.getString(ApiConfig.storageKeyAdminToken) ?? '').isNotEmpty;
      }
      return (prefs.getString(ApiConfig.storageKeyToken) ?? '').isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    // A device registration can outlive a logout. Never surface an alert to a
    // screen that no longer has a signed-in session.
    if (!await _hasActiveSession()) return;

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

    // On Android, FCM suppresses status bar / heads-up banners when the app is in the
    // foreground. Explicitly show the notification through FlutterLocalNotificationsPlugin
    // so the heads-up banner and notification shade alert appear.
    try {
      const androidDetails = AndroidNotificationDetails(
        'high_importance_channel',
        'Order & Customer Alerts',
        channelDescription:
            'Notifications for new customer orders, urgent help requests, and sales updates.',
        importance: Importance.max,
        priority: Priority.high,
        icon: 'ic_notification',
        largeIcon: DrawableResourceAndroidBitmap('ic_launcher'),
        color: Color(0xFF5B3DF5),
        playSound: true,
        enableVibration: true,
      );

      final notificationId =
          (message.messageId?.hashCode ?? message.hashCode) & 0x7FFFFFFF;
      await _localNotifications.show(
        id: notificationId,
        title: title,
        body: body,
        notificationDetails: const NotificationDetails(android: androidDetails),
        payload: data['link']?.toString(),
      );
    } catch (e) {
      debugPrint('[NotificationService] Foreground local notification display error: $e');
    }

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
  Future<bool> _removeDeviceRegistrationFromServer(
    ApiService apiService,
    String token,
  ) async {
    // The public endpoint works even when the Firebase bearer has expired.
    try {
      await apiService.post(
        ApiConfig.pathGlobalPushUnsubscribePublic,
        body: {'token': token},
      );
      return true;
    } catch (_) {}
    try {
      await apiService.post(
        ApiConfig.pathGlobalPushUnsubscribe,
        body: {'token': token},
      );
      return true;
    } catch (_) {}
    return false;
  }

  Future<bool> _removeAdminRegistrationFromServer(
    ApiService apiService,
    String token,
  ) async {
    try {
      await apiService.post(
        ApiConfig.pathAdminMailPushUnsubscribePublic,
        body: {'token': token},
      );
      return true;
    } catch (_) {}
    try {
      await apiService.post(
        ApiConfig.pathAdminMailPushUnsubscribe,
        body: {'token': token},
      );
      return true;
    } catch (_) {}
    return false;
  }

  Future<void> _persistPendingFlags() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefPendingUnsubscribe, _pendingUnsubscribe);
      await prefs.setBool(_prefPendingAdminUnsubscribe, _pendingAdminUnsubscribe);
    } catch (_) {}
  }

  /// Retries unsubscribes that failed during logout. Runs on init and every
  /// 30 seconds while either flag is set, so a dead session cannot keep sending
  /// alerts to this device indefinitely.
  Future<void> _retryPendingUnsubscribes(ApiService apiService) async {
    if (!_pendingUnsubscribe && !_pendingAdminUnsubscribe) return;
    final token = _fcmToken ?? await getDeviceToken(apiService);
    if (token == null || token.isEmpty) return;

    if (_pendingUnsubscribe &&
        await _removeDeviceRegistrationFromServer(apiService, token)) {
      _pendingUnsubscribe = false;
      _subscribedBusinessIds.clear();
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_prefSubscribedBiz);
      } catch (_) {}
    }

    if (_pendingAdminUnsubscribe &&
        await _removeAdminRegistrationFromServer(apiService, token)) {
      _pendingAdminUnsubscribe = false;
      _adminMailPush = false;
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_prefAdminMailPush);
      } catch (_) {}
    }

    await _persistPendingFlags();
  }

  /// Unsubscribes this device from merchant notices. Local state is only
  /// cleared after the server confirms removal; otherwise a pending flag keeps
  /// the cleanup alive until it succeeds.
  Future<void> onUserLoggedOut(ApiService apiService, [List<String>? businessIds]) async {
    final token = _fcmToken ?? await getDeviceToken(apiService);
    final toUnsubscribe = (businessIds != null && businessIds.isNotEmpty)
        ? businessIds
        : _subscribedBusinessIds.toList();

    for (final bId in toUnsubscribe) {
      if (bId.isEmpty) continue;
      try {
        await FirebaseMessaging.instance.unsubscribeFromTopic('business_$bId');
      } catch (_) {}
    }

    if (token == null || token.isEmpty) {
      if (toUnsubscribe.isNotEmpty || _pendingUnsubscribe) {
        _pendingUnsubscribe = true;
        await _persistPendingFlags();
      }
      return;
    }

    if (await _removeDeviceRegistrationFromServer(apiService, token)) {
      _pendingUnsubscribe = false;
      _subscribedBusinessIds.clear();
      _fcmToken = null;
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_prefSubscribedBiz);
      } catch (_) {}
    } else {
      _pendingUnsubscribe = true;
    }
    await _persistPendingFlags();
  }

  /// Asks for notification permission (on admin sign-in) and registers this device for
  /// the signed-in admin's mailbox alerts. The API derives the admin and console session
  /// from the bearer token, so only the FCM token crosses the wire.
  Future<bool> requestAdminMailPush(
    ApiService apiService, {
    bool requestPermission = true,
  }) async {
    await _ensureFirebaseInitialized(apiService);
    if (!_firebaseInitialized) return false;

    try {
      if (requestPermission) {
        var settings = await FirebaseMessaging.instance.getNotificationSettings();
        if (settings.authorizationStatus != AuthorizationStatus.authorized &&
            settings.authorizationStatus != AuthorizationStatus.provisional) {
          try {
            final androidPlugin = _localNotifications
                .resolvePlatformSpecificImplementation<
                    AndroidFlutterLocalNotificationsPlugin>();
            await androidPlugin?.requestNotificationsPermission();
          } catch (_) {}
          settings = await FirebaseMessaging.instance.requestPermission(
            alert: true,
            announcement: false,
            badge: true,
            carPlay: false,
            criticalAlert: false,
            provisional: false,
            sound: true,
          );
        }
        if (settings.authorizationStatus != AuthorizationStatus.authorized &&
            settings.authorizationStatus != AuthorizationStatus.provisional) {
          axiomService.info(
            'Admin mail push not subscribed: permission ${settings.authorizationStatus}',
            tag: 'FCM_ADMIN_MAIL',
          );
          return false;
        }
      }

      final token = await getDeviceToken(apiService);
      if (token == null || token.isEmpty) return false;

      await apiService.post(
        ApiConfig.pathAdminMailPushSubscribe,
        body: {
          'token': token,
          'platform': Platform.isAndroid ? 'android' : (Platform.isIOS ? 'ios' : 'web'),
          'device_label':
              Platform.isAndroid ? 'Android app' : (Platform.isIOS ? 'iOS app' : 'Device'),
        },
      );

      _adminMailPush = true;
      _pendingAdminUnsubscribe = false;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefAdminMailPush, true);
      await prefs.setBool(_prefPendingAdminUnsubscribe, false);
      axiomService.info('Admin mailbox push subscribed', tag: 'FCM_ADMIN_MAIL');
      return true;
    } catch (e, st) {
      axiomService.error(
        'Admin mail push subscribe failed: $e',
        error: e,
        stack: st,
        tag: 'FCM_ADMIN_MAIL_ERROR',
      );
      debugPrint('[NotificationService] Admin mail push subscribe failed: $e');
      return false;
    }
  }

  /// Removes this device from the admin mailbox alerts. Called on admin sign-out, before
  /// the console session itself is deleted.
  Future<void> unsubscribeAdminMailPush(ApiService apiService) async {
    bool wasSubscribed = _adminMailPush;
    try {
      final prefs = await SharedPreferences.getInstance();
      wasSubscribed = wasSubscribed ||
          (prefs.getBool(_prefAdminMailPush) ?? false) ||
          (prefs.getBool(_prefPendingAdminUnsubscribe) ?? false);
    } catch (_) {}
    if (!wasSubscribed) return;

    final token = _fcmToken ?? await getDeviceToken(apiService);
    if (token == null || token.isEmpty) {
      _pendingAdminUnsubscribe = true;
      await _persistPendingFlags();
      return;
    }

    if (await _removeAdminRegistrationFromServer(apiService, token)) {
      _pendingAdminUnsubscribe = false;
      _adminMailPush = false;
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_prefAdminMailPush);
      } catch (_) {}
      axiomService.info('Admin mailbox push unsubscribed', tag: 'FCM_ADMIN_MAIL');
    } else {
      _pendingAdminUnsubscribe = true;
    }
    await _persistPendingFlags();
  }

  /// Sends a single test notification to verify that the FCM path to this device is working.
  Future<Map<String, dynamic>?> sendTestAdminMailPush(ApiService apiService) async {
    try {
      final response = await apiService.post(ApiConfig.pathAdminMailPushTest);
      if (response is Map<String, dynamic>) {
        axiomService.info('Admin test mail push triggered', tag: 'FCM_ADMIN_MAIL');
        return response;
      }
      return null;
    } catch (e, st) {
      axiomService.error(
        'Admin test mail push failed: $e',
        error: e,
        stack: st,
        tag: 'FCM_ADMIN_MAIL_ERROR',
      );
      debugPrint('[NotificationService] Admin test mail push failed: $e');
      rethrow;
    }
  }

  /// Called once at startup. Re-registers only when the app is in an admin session that
  /// previously enabled alerts, so boot never shows a permission prompt.
  Future<void> restoreAdminMailPush(ApiService apiService) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sessionType = prefs.getString(ApiConfig.storageKeyUserSessionType);
      final adminToken = prefs.getString(ApiConfig.storageKeyAdminToken);
      final enabled = prefs.getBool(_prefAdminMailPush) ?? false;
      if (sessionType != 'admin' || !enabled) return;
      if (adminToken == null || adminToken.isEmpty) return;
      await requestAdminMailPush(apiService, requestPermission: false);
    } catch (e) {
      debugPrint('[NotificationService] Admin mail push restore skipped: $e');
    }
  }
}
