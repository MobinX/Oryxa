import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/business_provider.dart';
import '../screens/diagnostics/diagnostics_screen.dart';
import '../screens/orders/create_order_screen.dart';
import '../screens/products/product_form_screen.dart';
import '../services/diagnostics_service.dart';
import 'app_feedback.dart';

/// The one way the app opens a create form. When no store is loaded it explains
/// why instead of returning silently, which is what made the buttons look dead.
Future<void> openCreateOrder(BuildContext context) {
  return _openForStore(
    context,
    action: 'New order',
    build: (businessId) => CreateOrderScreen(businessId: businessId),
  );
}

Future<void> openProductForm(BuildContext context, {ProductModel? product}) {
  return _openForStore(
    context,
    action: product == null ? 'Add product' : 'Edit product',
    build: (businessId) => ProductFormScreen(
      businessId: businessId,
      product: product,
    ),
  );
}

Future<void> _openForStore(
  BuildContext context, {
  required String action,
  required Widget Function(String businessId) build,
}) async {
  final biz = context.read<BusinessProvider>();
  final store = biz.currentBusiness;

  if (store == null) {
    await _showStoreMissing(context, action: action);
    return;
  }

  try {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => build(store.id)),
    );
  } catch (error, stack) {
    appDiagnostics.record('$action screen', error, stack);
    if (!context.mounted) return;
    await showProblemDialog(
      context,
      title: '$action could not open',
      message: 'The screen failed to start.',
      fix: 'Open Diagnostics from the More tab and check the recorded error. '
          'If the app is on an old OTA patch, reinstall the current APK.',
      details: '$error\n\n$stack',
    );
  }
}

/// Reloads the store list and says out loud what happened.
Future<void> reloadStore(BuildContext context) async {
  final auth = context.read<AuthProvider>();
  final biz = context.read<BusinessProvider>();

  await biz.fetchBusinesses(preferredBusinessId: auth.selectedBusinessId);
  if (!context.mounted) return;

  if (biz.currentBusiness != null) {
    showAppSnack('Store loaded: ${biz.currentBusiness!.name}');
  } else {
    appDiagnostics.recordMessage(
      'Store reload',
      biz.errorMessage ?? 'No store is attached to this account',
    );
    showAppSnack(
      biz.errorMessage ?? 'No store is attached to this account',
      isError: true,
    );
  }
}

Future<void> _showStoreMissing(
  BuildContext context, {
  required String action,
}) async {
  final biz = context.read<BusinessProvider>();
  final auth = context.read<AuthProvider>();
  final user = auth.user;

  final details = <String>[
    'Signed in: ${auth.isAuthenticated ? 'yes' : 'no'}',
    if (user != null) 'User: ${user.email ?? user.id}',
    'API: ${biz.apiService.baseUrl}',
    'Stores loaded: ${biz.businesses.length}',
    'Store loading: ${biz.isLoading}',
    if (biz.errorMessage != null) 'Store error: ${biz.errorMessage}',
  ].join('\n');

  appDiagnostics.recordMessage(
    action,
    'No store is loaded, so the form cannot be opened',
    details: details,
  );

  await showDialog<void>(
    context: context,
    builder: (ctx) {
      return AlertDialog(
        icon: const Icon(Icons.store_mall_directory_outlined),
        title: Text('Can\'t open $action'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'No store is loaded for this account yet, so there is nothing '
                'to attach the form to. This is why the button appeared to do '
                'nothing.',
                style: TextStyle(height: 1.4),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  details,
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DiagnosticsScreen()),
              );
            },
            child: const Text('Diagnostics'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              reloadStore(context);
            },
            child: const Text('Reload store'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      );
    },
  );
}
