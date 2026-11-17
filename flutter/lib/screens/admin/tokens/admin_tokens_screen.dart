import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

class AdminTokensScreen extends StatefulWidget {
  const AdminTokensScreen({super.key});

  @override
  State<AdminTokensScreen> createState() => _AdminTokensScreenState();
}

class _AdminTokensScreenState extends State<AdminTokensScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AdminProvider>().fetchAdminStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    final admin = context.watch<AdminProvider>();
    final stats = admin.stats;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return RefreshIndicator(
      onRefresh: () => admin.fetchAdminStats(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.memory_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'LLM Token Analytics',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Model invocation tracking and platform consumption breakdown.',
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 16),
          if (stats != null) ...[
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Window Tokens Total', style: TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          '${stats.window.llmTokens} tokens',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Estimated Cost (USD)', style: TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          '\$${stats.window.estimatedCostUsd.toStringAsFixed(3)}',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Agent Executions', style: TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          '${stats.window.agentRuns} runs',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
