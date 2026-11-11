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
import 'screens/business/business_picker_screen.dart';
import 'screens/main_scaffold.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/patch_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize flutter_patcher runtime and crash-protection rollback
  try {
    await FlutterPatcher.init();
    debugPrint('[FlutterPatcher] Initialized successfully');
  } catch (e) {
    debugPrint('[FlutterPatcher] Safe fallback to baseline: $e');
  }

  final apiService = ApiService();
  final authService = AuthService(apiService: apiService);
  await authService.init();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        ChangeNotifierProvider<PatchService>(create: (_) => PatchService()),
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
}

class OnlyOrdersApp extends StatelessWidget {
  const OnlyOrdersApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OnlyOrders Merchant',
      debugShowCheckedModeBanner: false,
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
