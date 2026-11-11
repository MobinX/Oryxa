import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../services/patch_service.dart';
import '../../widgets/app_card.dart';

class OtaUpdateScreen extends StatefulWidget {
  const OtaUpdateScreen({super.key});

  @override
  State<OtaUpdateScreen> createState() => _OtaUpdateScreenState();
}

class _OtaUpdateScreenState extends State<OtaUpdateScreen> {
  late TextEditingController _workerUrlController;

  @override
  void initState() {
    super.initState();
    final patch = context.read<PatchService>();
    _workerUrlController = TextEditingController(text: patch.workerUrl);
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
}
