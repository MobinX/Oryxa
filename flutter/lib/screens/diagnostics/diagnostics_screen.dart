import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_patcher/flutter_patcher.dart';
import 'package:provider/provider.dart';

import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/customers_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/products_provider.dart';
import '../../services/api_service.dart';
import '../../services/diagnostics_service.dart';
import '../../services/patch_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_feedback.dart';

/// Keep in sync with `pubspec.yaml` (`version: 1.0.2+3`).
const String _appVersionLabel = '1.0.2+3';

/// Everything needed to explain a silent button: which code is actually
/// running, who is signed in, whether a store loaded, which API is called, and
/// what failed last.
class DiagnosticsScreen extends StatefulWidget {
  const DiagnosticsScreen({super.key});

  @override
  State<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _DiagnosticsScreenState extends State<DiagnosticsScreen> {
  String? _installedPatch;
  PatchBootDiagnostic? _boot;
  bool _loadingRuntime = true;
  bool _runningChecks = false;
  List<_CheckResult> _checks = const [];

  @override
  void initState() {
    super.initState();
    _loadRuntime();
  }

  Future<void> _loadRuntime() async {
    String? patch;
    PatchBootDiagnostic? boot;
    try {
      patch = await FlutterPatcher.currentVersion;
    } catch (e) {
      appDiagnostics.record('Patch version', e);
    }
    try {
      boot = await FlutterPatcher.lastBootDiagnostic;
    } catch (e) {
      appDiagnostics.record('Patch boot status', e);
    }
    if (!mounted) return;
    setState(() {
      _installedPatch = patch;
      _boot = boot;
      _loadingRuntime = false;
    });
  }

  Future<void> _reloadStore() async {
    final auth = context.read<AuthProvider>();
    final biz = context.read<BusinessProvider>();
    await biz.fetchBusinesses(preferredBusinessId: auth.selectedBusinessId);
    if (!mounted) return;
    if (biz.currentBusiness == null) {
      showAppSnack(
        biz.errorMessage ?? 'No store is attached to this account',
        isError: true,
      );
    } else {
      showAppSnack('Store loaded: ${biz.currentBusiness!.name}');
    }
  }

  Future<void> _runChecks() async {
    if (_runningChecks) return;
    setState(() => _runningChecks = true);

    final api = context.read<ApiService>();
    final biz = context.read<BusinessProvider>();
    final results = <_CheckResult>[];

    Future<void> check(String label, Future<dynamic> Function() call) async {
      try {
        final value = await call();
        results.add(_CheckResult(label, true, _describe(value)));
      } catch (e) {
        if (e is ApiException) {
          results.add(_CheckResult(label, false, '[${e.statusCode}] ${e.message}'));
        } else {
          results.add(_CheckResult(label, false, e.toString()));
        }
        appDiagnostics.record('Check $label', e);
      }
    }

    await check('/users/me', () => api.get(ApiConfig.pathUsersMe));
    await check('/businesses', () => api.get(ApiConfig.pathBusinesses));

    final store = biz.currentBusiness;
    if (store != null) {
      await check(
        'products',
        () => api.get(ApiConfig.pathProducts(store.id, limit: 1)),
      );
    }

    if (!mounted) return;
    setState(() {
      _checks = results;
      _runningChecks = false;
    });
  }

  String _describe(dynamic value) {
    if (value is Map) {
      if (value['businesses'] is List) {
        return '${(value['businesses'] as List).length} stores';
      }
      if (value['products'] is List) {
        return '${(value['products'] as List).length} products';
      }
      if (value['id'] != null) return 'id ${value['id']}';
      return '${value.length} fields';
    }
    if (value is List) return '${value.length} items';
    if (value == null) return 'empty response';
    return value.toString();
  }

  Future<void> _copyReport(
    BusinessProvider biz,
    AuthProvider auth,
    ApiService api,
    List<DiagnosticEntry> entries,
  ) async {
    final boot = _boot;
    final lines = <String>[
      'OnlyOrders diagnostics',
      'App version: $_appVersionLabel',
      'Installed patch: ${_installedPatch ?? 'none'}',
      if (boot != null)
        'Boot status: ${boot.status.name}'
            '${boot.patchVersion != null ? ' (patch ${boot.patchVersion})' : ''}'
            '${boot.appVersionCode != null ? ' app vc ${boot.appVersionCode}' : ''}'
            '${boot.patchTargetVersionCode != null ? ' patch vc ${boot.patchTargetVersionCode}' : ''}',
      'API: ${api.baseUrl}',
      'Signed in: ${auth.isAuthenticated}',
      'User: ${auth.user?.email ?? auth.user?.id ?? 'unknown'}',
      'Selected store id: ${auth.selectedBusinessId ?? 'none'}',
      'Stores loaded: ${biz.businesses.length}',
      'Current store: ${biz.currentBusiness?.name ?? 'none'}',
      'Store error: ${biz.errorMessage ?? 'none'}',
      ...entries.map(
        (e) => '[${e.timeLabel}] ${e.scope}: ${e.message}'
            '${e.details != null ? '\n${e.details}' : ''}',
      ),
    ];
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    if (!mounted) return;
    showAppSnack('Diagnostics copied');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final biz = context.watch<BusinessProvider>();
    final api = context.watch<ApiService>();
    final products = context.watch<ProductsProvider>();
    final orders = context.watch<OrdersProvider>();
    final inbox = context.watch<InboxProvider>();
    final customers = context.watch<CustomersProvider>();
    final diagnostics = context.watch<DiagnosticsService>();
    final patch = context.watch<PatchService>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final boot = _boot;
    final needsNativeRebuild =
        boot?.status == PatchBootStatus.droppedVersionCodeMismatch ||
            boot?.status == PatchBootStatus.droppedCircuitBreaker ||
            boot?.status == PatchBootStatus.hookInstallFailed;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Diagnostics'),
        actions: [
          IconButton(
            tooltip: 'Reload runtime info',
            onPressed: () {
              setState(() => _loadingRuntime = true);
              _loadRuntime();
            },
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Copy full report',
            onPressed: () => _copyReport(biz, auth, api, diagnostics.entries),
            icon: const Icon(Icons.copy_all_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (needsNativeRebuild)
            AppCard(
              color: AppTheme.dangerBg,
              border: BorderSide(color: AppTheme.danger.withValues(alpha: 0.4)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: AppTheme.danger),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'This APK cannot load the OTA patch',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.danger,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _bootExplanation(boot!),
                          style: const TextStyle(fontSize: 12, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          if (needsNativeRebuild) const SizedBox(height: 12),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(Icons.memory_outlined, 'Running code'),
                const SizedBox(height: 10),
                if (_loadingRuntime)
                  const LinearProgressIndicator()
                else ...[
                  _row('App version', _appVersionLabel),
                  _row(
                    'Installed patch',
                    _installedPatch == null
                        ? 'None (baseline APK)'
                        : 'Patch $_installedPatch',
                  ),
                  _row(
                    'This launch',
                    boot == null
                        ? 'Unknown'
                        : switch (boot.status) {
                            PatchBootStatus.patched => 'Patched code active',
                            PatchBootStatus.noPatch => 'Baseline APK code',
                            _ => 'Patch not loaded',
                          },
                    valueColor: switch (boot?.status) {
                      PatchBootStatus.patched => AppTheme.success,
                      PatchBootStatus.noPatch => null,
                      _ => AppTheme.danger,
                    },
                  ),
                  if (boot != null && boot.appVersionCode != null)
                    _row('APK version code', '${boot.appVersionCode}'),
                  if (boot != null && boot.patchTargetVersionCode != null)
                    _row('Patch targets', 'version code ${boot.patchTargetVersionCode}'),
                  if (boot != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _bootExplanation(boot),
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: isDark ? Colors.grey.shade300 : Colors.grey.shade700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: patch.isChecking
                        ? null
                        : () => patch.checkForUpdates(force: true),
                    icon: patch.isChecking
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.system_update_alt, size: 16),
                    label: Text(
                      patch.isChecking
                          ? 'Checking for patch…'
                          : 'Re-check OTA patch',
                    ),
                  ),
                  if (patch.restartRequired) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'A patch was installed. Force-stop the app and reopen it to '
                      'run the new code.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ],
                  if (_installedPatch != null &&
                      boot?.status != PatchBootStatus.patched) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'OTA patches only load on a cold start. Force-stop the app '
                      '(swipe it away from recent apps) and open it again.',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(Icons.dns_outlined, 'API & session'),
                const SizedBox(height: 10),
                _row('API base URL', api.baseUrl),
                _row('Signed in', auth.isAuthenticated ? 'Yes' : 'No'),
                _row(
                  'User',
                  auth.user?.email ?? auth.user?.id ?? 'Not loaded',
                ),
                _row('Selected store id', auth.selectedBusinessId ?? 'None'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _runningChecks ? null : _runChecks,
                      icon: _runningChecks
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.network_check, size: 16),
                      label: Text(_runningChecks ? 'Testing…' : 'Test API'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _reloadStore,
                      icon: const Icon(Icons.storefront_outlined, size: 16),
                      label: const Text('Reload store'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await auth.logout();
                        if (!context.mounted) return;
                        showAppSnack('Signed out');
                      },
                      icon: const Icon(Icons.logout, size: 16),
                      label: const Text('Sign out'),
                    ),
                  ],
                ),
                if (_checks.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ..._checks.map(
                    (check) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            check.ok
                                ? Icons.check_circle_outline
                                : Icons.error_outline,
                            size: 16,
                            color: check.ok ? AppTheme.success : AppTheme.danger,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: SelectableText(
                              '${check.label}: ${check.detail}',
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(Icons.store_outlined, 'Store'),
                const SizedBox(height: 10),
                _row('Stores loaded', '${biz.businesses.length}'),
                _row('Current store', biz.currentBusiness?.name ?? 'None'),
                _row('Current store id', biz.currentBusiness?.id ?? 'None'),
                _row('Loading', biz.isLoading ? 'Yes' : 'No'),
                _row(
                  'Store error',
                  biz.errorMessage ?? 'None',
                  valueColor: biz.errorMessage == null ? null : AppTheme.danger,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(Icons.warning_outlined, 'Last provider errors'),
                const SizedBox(height: 10),
                _row('Products', products.errorMessage ?? 'None'),
                _row('Orders', orders.errorMessage ?? 'None'),
                _row('Inbox', inbox.errorMessage ?? 'None'),
                _row('Customers', customers.errorMessage ?? 'None'),
              ],
            ),
          ),
          const SizedBox(height: 12),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _sectionTitle(
                        Icons.bug_report_outlined,
                        'Recorded errors (${diagnostics.entries.length})',
                      ),
                    ),
                    if (diagnostics.entries.isNotEmpty)
                      TextButton(
                        onPressed: diagnostics.clear,
                        child: const Text('Clear'),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                if (diagnostics.entries.isEmpty)
                  const Text(
                    'Nothing recorded. If a button still does nothing, tap it '
                    'once and this list will explain why.',
                    style: TextStyle(fontSize: 12),
                  )
                else
                  ...diagnostics.entries.take(30).map(
                        (entry) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: const Icon(
                            Icons.error_outline,
                            color: AppTheme.danger,
                            size: 18,
                          ),
                          title: Text(
                            '${entry.scope}: ${entry.message}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12),
                          ),
                          subtitle: Text(
                            entry.timeLabel,
                            style: const TextStyle(fontSize: 10),
                          ),
                          trailing: const Icon(Icons.chevron_right, size: 18),
                          onTap: () => _showEntry(entry),
                        ),
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(IconData icon, String title) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.primaryColor),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
        ),
      ],
    );
  }

  Widget _row(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: valueColor,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showEntry(DiagnosticEntry entry) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(entry.scope),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${entry.timeLabel} — ${entry.message}'),
              if (entry.details != null && entry.details!.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                const Text(
                  'Stack trace',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                SelectableText(
                  entry.details!,
                  style: const TextStyle(fontSize: 10, fontFamily: 'monospace'),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  String _bootExplanation(PatchBootDiagnostic boot) {
    switch (boot.status) {
      case PatchBootStatus.patched:
        return 'The installed patch was loaded for this launch.';
      case PatchBootStatus.noPatch:
        return 'No patch is installed on this device; the APK\'s built-in code '
            'is running.';
      case PatchBootStatus.droppedVersionCodeMismatch:
        return 'The patch targets APK version code '
            '${boot.patchTargetVersionCode ?? '?'}, but this APK is '
            '${boot.appVersionCode ?? '?'}. This OTA patch can never load here; '
            'install a rebuilt APK.';
      case PatchBootStatus.droppedCircuitBreaker:
        return 'The patch crashed during startup and was rolled back. Install a '
            'rebuilt APK, or apply the next patch after the crash is fixed.';
      case PatchBootStatus.droppedMd5Mismatch:
        return 'The installed patch file failed its MD5 check and was dropped. '
            'Apply the patch again.';
      case PatchBootStatus.droppedSignatureInvalid:
        return 'The patch signature was rejected. Apply a correctly signed patch.';
      case PatchBootStatus.droppedMetaCorrupted:
        return 'The installed patch files are damaged. Apply the patch again.';
      case PatchBootStatus.hookInstallFailed:
        return 'The patcher could not hook Flutter\'s loader in this APK. A '
            'native rebuild is required.';
      case PatchBootStatus.unknown:
        return boot.message ??
            'The last cold start did not report which patch decision it made.';
    }
  }
}

class _CheckResult {
  final String label;
  final bool ok;
  final String detail;

  const _CheckResult(this.label, this.ok, this.detail);
}
