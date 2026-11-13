import 'package:flutter/material.dart';
import 'package:flutter_patcher/flutter_patcher.dart';
import 'package:provider/provider.dart';

import 'config/app_theme.dart';
import 'providers/auth_provider.dart';
import 'providers/business_provider.dart';
import 'providers/inbox_provider.dart';
import 'providers/orders_provider.dart';
import 'providers/products_provider.dart';
import 'providers/customers_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main_scaffold.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/diagnostics_service.dart';
import 'services/patch_service.dart';
import 'widgets/app_feedback.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A build failure in a pushed screen must leave a trace the merchant can read;
  // the Diagnostics screen shows this log and can copy it.
  FlutterError.onError = (details) {
    appDiagnostics.record('Flutter error', details.exception, details.stack);
    FlutterError.presentError(details);
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

  // Restore the previous session's failures so a crash-loop or a dead button
  // still has evidence after a restart.
  await appDiagnostics.loadPersisted();

  final apiService = ApiService();
  final authService = AuthService(apiService: apiService);
  final patchService = PatchService();
  await authService.init();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        ChangeNotifierProvider<DiagnosticsService>.value(value: appDiagnostics),
        ChangeNotifierProvider<PatchService>.value(value: patchService),
        ChangeNotifierProvider<AuthProvider>(create: (_) => AuthProvider(authService: authService)),
        ChangeNotifierProvider<BusinessProvider>(create: (_) => BusinessProvider(apiService: apiService)),
        ChangeNotifierProvider<InboxProvider>(create: (_) => InboxProvider(apiService: apiService)),
        ChangeNotifierProvider<OrdersProvider>(create: (_) => OrdersProvider(apiService: apiService)),
        ChangeNotifierProvider<ProductsProvider>(create: (_) => ProductsProvider(apiService: apiService)),
        ChangeNotifierProvider<CustomersProvider>(create: (_) => CustomersProvider(apiService: apiService)),
      ],
      child: const OnlyOrdersApp(),
    ),
  );

  // Install published hotfixes without requiring the merchant to open the OTA
  // screen. Failures are recorded for the Diagnostics screen.
  patchService.autoCheckOnBoot().then((_) {
    if (patchService.restartRequired) {
      showAppSnack(
        'Update installed. Close the app completely and reopen it to use it.',
      );
    }
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
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (!auth.isAuthenticated) {
      return const LoginScreen();
    }

    // Authenticated: route to main merchant scaffold
    return const MainScaffold();
  }
}
