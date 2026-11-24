import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_patcher/flutter_patcher.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'config/app_theme.dart';
import 'providers/admin_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/business_provider.dart';
import 'providers/inbox_provider.dart';
import 'providers/orders_provider.dart';
import 'providers/products_provider.dart';
import 'providers/customers_provider.dart';
import 'screens/admin/admin_scaffold.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main_scaffold.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/axiom_service.dart';
import 'services/diagnostics_service.dart';
import 'services/facebook_connect_service.dart';
import 'services/notification_service.dart';
import 'services/patch_service.dart';
import 'widgets/app_feedback.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Inter ships inside the app assets. Fail loudly in debug if a weight is
  // missing instead of silently fetching a font from the network.
  GoogleFonts.config.allowRuntimeFetching = false;

  // A build failure in a pushed screen must leave a trace the merchant can read;
  // the Diagnostics screen shows this log and streams directly to Axiom.
  FlutterError.onError = (details) {
    appDiagnostics.record('Flutter error', details.exception, details.stack);
    axiomService.error(
      'Flutter framework error: ${details.exceptionAsString()}',
      error: details.exception,
      stack: details.stack,
      tag: 'FLUTTER_ERROR',
    );
    FlutterError.presentError(details);
  };

  // Catch unhandled async and platform errors before they terminate the process
  PlatformDispatcher.instance.onError = (error, stack) {
    appDiagnostics.record('Platform error', error, stack);
    axiomService.error(
      'Uncaught platform error: $error',
      error: error,
      stack: stack,
      tag: 'PLATFORM_ERROR',
    );
    return true; // Prevents the uncaught exception from aborting the app process
  };

  // Release builds otherwise replace a crashed screen with an anonymous grey
  // box, which merchants read as "the button did nothing".
  ErrorWidget.builder = (details) => AppBuildErrorWidget(details: details);

  // Initialize flutter_patcher runtime and crash-protection rollback
  try {
    await FlutterPatcher.init();
    debugPrint('[FlutterPatcher] Initialized successfully');
  } catch (e) {
    debugPrint('[FlutterPatcher] Safe fallback to baseline: $e');
  }

  final apiService = ApiService();
  final authService = AuthService(apiService: apiService);
  final adminProvider = AdminProvider(apiService: apiService, authService: authService);
  final patchService = PatchService();
  final facebookConnectService = FacebookConnectService(apiService: apiService);

  // Admin state must be normalized first. A session-type flag left as
  // "merchant" by the switch shortcut (or by an older build) otherwise lets
  // AuthService restore a merchant bearer over the console key, which renders
  // the console shell with credentials the API rejects.
  await adminProvider.init();
  await authService.init();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        ChangeNotifierProvider<DiagnosticsService>.value(value: appDiagnostics),
        ChangeNotifierProvider<PatchService>.value(value: patchService),
        ChangeNotifierProvider<AuthProvider>(create: (_) => AuthProvider(authService: authService)),
        ChangeNotifierProvider<AdminProvider>.value(value: adminProvider),
        ChangeNotifierProvider<FacebookConnectService>.value(value: facebookConnectService),
        ChangeNotifierProvider<BusinessProvider>(create: (_) => BusinessProvider(apiService: apiService)),
        ChangeNotifierProvider<InboxProvider>(create: (_) => InboxProvider(apiService: apiService)),
        ChangeNotifierProvider<OrdersProvider>(create: (_) => OrdersProvider(apiService: apiService)),
        ChangeNotifierProvider<ProductsProvider>(create: (_) => ProductsProvider(apiService: apiService)),
        ChangeNotifierProvider<CustomersProvider>(create: (_) => CustomersProvider(apiService: apiService)),
      ],
      child: const OnlyOrdersApp(),
    ),
  );

  // Defer non-critical services and telemetry to run asynchronously after the first frame
  // Drastically accelerates app startup and renders screens immediately.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    Future.delayed(const Duration(milliseconds: 300), () {
      appDiagnostics.loadPersisted();
      axiomService.init(baseUrl: apiService.baseUrl, appVersion: '1.0.18+28');
      facebookConnectService.init();
      NotificationService.instance.init(apiService);

      // Install published hotfixes without requiring the merchant to open the OTA screen
      patchService.autoCheckOnBoot().then((_) {
        if (patchService.restartRequired) {
          showAppSnack(
            'Update installed. Close the app completely and reopen it to use it.',
          );
        }
      });
    });
  });
}

class OnlyOrdersApp extends StatelessWidget {
  const OnlyOrdersApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OnlyOrders Merchant',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: appMessengerKey,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      onGenerateRoute: (settings) => MaterialPageRoute(builder: (_) => const AuthGate()),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final admin = context.watch<AdminProvider>();

    if (admin.sessionType == 'admin' && admin.isAuthenticated) {
      return const AdminScaffold();
    }

    if (auth.isAuthenticated) {
      return const MainScaffold();
    }

    return const LoginScreen();
  }
}
