import 'package:flutter/material.dart';
import 'package:flutter_patcher/flutter_patcher.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../services/diagnostics_service.dart';
import '../../services/patch_service.dart';
import '../../widgets/app_card.dart';
import '../diagnostics/diagnostics_screen.dart';

class OtaUpdateScreen extends StatefulWidget {
  const OtaUpdateScreen({super.key});

  @override
  State<OtaUpdateScreen> createState() => _OtaUpdateScreenState();
}

class _OtaUpdateScreenState extends State<OtaUpdateScreen> {
  late TextEditingController _workerUrlController;
  String? _installedPatch;
  PatchBootDiagnostic? _boot;
  String? _runtimeError;
  bool _loadingRuntime = true;

  @override
  void initState() {
    super.initState();
    final patch = context.read<PatchService>();
    _workerUrlController = TextEditingController(text: patch.workerUrl);
    _loadRuntime();
  }

  /// The question behind "I updated but nothing changed": is there a patch on
  /// disk, and did this cold start actually load it?
  Future<void> _loadRuntime() async {
    String? installed;
    PatchBootDiagnostic? boot;
    String? error;
    try {
      installed = await FlutterPatcher.currentVersion;
    } catch (e) {
      error = 'Could not read the installed patch: $e';
      appDiagnostics.record('Patch version', e);
    }
    try {
      boot = await FlutterPatcher.lastBootDiagnostic;
    } catch (e) {
      error ??= 'Could not read the patch boot status: $e';
      appDiagnostics.record('Patch boot status', e);
    }
    if (!mounted) return;
    setState(() {
      _installedPatch = installed;
      _boot = boot;
      _runtimeError = error;
      _loadingRuntime = false;
    });
  }

  @override
  void dispose() {
    _workerUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final patch = context.watch<PatchService>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('OTA Remote Hotfixes')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Runtime patch status: what is installed vs what this launch loaded.
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.memory_outlined,
                        size: 18, color: AppTheme.primaryColor),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Patch status on this device',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh status',
                      visualDensity: VisualDensity.compact,
                      onPressed: () {
                        setState(() => _loadingRuntime = true);
                        _loadRuntime();
                      },
                      icon: const Icon(Icons.refresh, size: 18),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                if (_loadingRuntime)
                  const LinearProgressIndicator()
                else ...[
                  _statusRow(
                    'Installed patch',
                    _installedPatch == null
                        ? 'None (this APK runs its built-in code)'
                        : 'Patch $_installedPatch',
                  ),
                  _statusRow(
                    'Loaded this launch',
                    switch (_boot?.status) {
                      PatchBootStatus.patched => 'Yes — patched code is running',
                      PatchBootStatus.noPatch => 'No — baseline APK code',
                      null => 'Unknown',
                      _ => 'No — the patch was dropped at startup',
                    },
                    color: switch (_boot?.status) {
                      PatchBootStatus.patched => AppTheme.success,
                      PatchBootStatus.noPatch => null,
                      null => null,
                      _ => AppTheme.danger,
                    },
                  ),
                  if (_boot?.appVersionCode != null)
                    _statusRow('APK version code', '${_boot!.appVersionCode}'),
                  if (_boot?.patchTargetVersionCode != null)
                    _statusRow(
                      'Patch targets',
                      'version code ${_boot!.patchTargetVersionCode}',
                    ),
                  if (_runtimeError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _runtimeError!,
                      style: const TextStyle(fontSize: 11, color: AppTheme.danger),
                    ),
                  ],
                  const SizedBox(height: 10),
                  _statusExplanation(),
                  if (patch.restartRequired) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryColor.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'A patch was installed. Force-stop the app and open it '
                        'again to run the updated code.',
                        style: TextStyle(
                          fontSize: 11,
                          height: 1.4,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Architecture Card
          AppCard(
            color: AppTheme.primaryColor.withValues(alpha: 0.08),
            border: BorderSide(color: AppTheme.primaryColor.withValues(alpha: 0.2)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.cloud_sync_outlined, color: AppTheme.primaryColor, size: 22),
                    SizedBox(width: 8),
                    Text(
                      'Edge Over-The-Air Hotfix Engine',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.primaryColor),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Dart UI & business logic updates are pushed to GitHub Actions, signed with MD5, and streamed via Cloudflare Workers directly to your device without reinstalling APKs.',
                  style: TextStyle(fontSize: 12, color: isDark ? Colors.grey.shade300 : Colors.grey.shade800, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Worker URL & Check for Updates
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Cloudflare Worker Endpoint', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 8),
                TextField(
                  controller: _workerUrlController,
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.dns, size: 20),
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                  onSubmitted: (url) => patch.setWorkerUrl(url),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: patch.isChecking ? null : () => patch.checkForUpdates(),
                    icon: patch.isChecking
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Icon(Icons.sync, size: 18),
                    label: Text(patch.isChecking ? 'Checking Edge Worker...' : 'Check & Apply Updates'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Real-time Patcher Console Logs
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Patcher Activity Logs', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text('${patch.logs.length} entries', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            height: 240,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F111A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white12),
            ),
            child: patch.logs.isEmpty
                ? const Center(
                    child: Text(
                      'Ready. Tap "Check & Apply Updates" to query Worker.',
                      style: TextStyle(color: Colors.white54, fontSize: 12, fontFamily: 'monospace'),
                    ),
                  )
                : ListView.builder(
                    itemCount: patch.logs.length,
                    itemBuilder: (context, index) {
                      final log = patch.logs[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          log,
                          style: const TextStyle(
                            color: Color(0xFF10B981),
                            fontFamily: 'monospace',
                            fontSize: 11,
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _statusRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusExplanation() {
    final boot = _boot;
    if (boot == null) {
      return Text(
        'This build does not expose patch boot status. Install a native APK '
        'built from this source to enable OTA diagnostics.',
        style: TextStyle(fontSize: 11, height: 1.4, color: Colors.grey.shade600),
      );
    }

    final explanation = switch (boot.status) {
      PatchBootStatus.patched =>
        'The patch is active in this session. No further action needed.',
      PatchBootStatus.noPatch =>
        'No patch is installed here yet, so the app is running the APK code. '
            'Tap "Check & Apply Updates", then force-stop and reopen the app.',
      PatchBootStatus.droppedVersionCodeMismatch =>
        'This APK cannot load the published patch: the patch targets version '
            'code ${boot.patchTargetVersionCode ?? '?'} but the APK is '
            '${boot.appVersionCode ?? '?'}. A new native APK must be built and '
            'installed before OTA fixes can reach this device.',
      PatchBootStatus.droppedCircuitBreaker =>
        'The patch crashed during startup and was rolled back automatically. '
            'Install the current native APK before applying more patches.',
      PatchBootStatus.droppedMd5Mismatch =>
        'The downloaded patch failed verification and was dropped. '
            'Re-apply the update from this screen.',
      PatchBootStatus.droppedSignatureInvalid =>
        'The patch signature was rejected. Re-apply the update, or install a '
            'newly built APK if the signing key changed.',
      PatchBootStatus.droppedMetaCorrupted =>
        'Patch files on the device are damaged. Re-apply the update, or clear '
            'app data and install the current APK.',
      PatchBootStatus.hookInstallFailed =>
        'The patcher could not hook the Flutter loader in this APK. A native '
            'rebuild is required.',
      PatchBootStatus.unknown =>
        boot.message ??
            'The last cold start did not report a patch decision. Force-stop '
                'the app and open it again to refresh this status.',
    };

    final needsNative = switch (boot.status) {
      PatchBootStatus.droppedVersionCodeMismatch ||
      PatchBootStatus.droppedCircuitBreaker ||
      PatchBootStatus.hookInstallFailed =>
        true,
      _ => false,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          explanation,
          style: TextStyle(
            fontSize: 11,
            height: 1.4,
            color: needsNative ? AppTheme.danger : Colors.grey.shade600,
          ),
        ),
        if (boot.status != PatchBootStatus.patched) ...[
          const SizedBox(height: 6),
          const Text(
            'OTA changes only load on a cold start. Swipe the app away from '
            'recent apps and open it again after applying a patch.',
            style: TextStyle(
              fontSize: 11,
              height: 1.4,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DiagnosticsScreen()),
              );
            },
            icon: const Icon(Icons.bug_report_outlined, size: 16),
            label: const Text('Open full diagnostics'),
          ),
        ),
      ],
    );
  }
}
