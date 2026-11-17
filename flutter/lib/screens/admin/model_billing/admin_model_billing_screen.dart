import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

class AdminModelBillingScreen extends StatefulWidget {
  const AdminModelBillingScreen({super.key});

  @override
  State<AdminModelBillingScreen> createState() => _AdminModelBillingScreenState();
}

class _AdminModelBillingScreenState extends State<AdminModelBillingScreen> {
  final _promptRateController = TextEditingController();
  final _completionRateController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _provider;
  String? _model;
  String? _updatedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRates());
  }

  @override
  void dispose() {
    _promptRateController.dispose();
    _completionRateController.dispose();
    super.dispose();
  }

  Future<void> _loadRates() async {
    final admin = context.read<AdminProvider>();
    final data = await admin.fetchModelBilling();
    if (mounted) {
      if (data != null) {
        _provider = (data['provider'] ?? 'google').toString();
        _model = (data['model'] ?? 'gemini-2.5-flash-lite').toString();
        _promptRateController.text = (data['promptPerMillion'] ?? '0.075').toString();
        _completionRateController.text = (data['completionPerMillion'] ?? '0.30').toString();
        _updatedAt = data['updatedAt']?.toString();
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSave() async {
    final promptRate = double.tryParse(_promptRateController.text.trim());
    final completionRate = double.tryParse(_completionRateController.text.trim());

    if (promptRate == null || completionRate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter valid numeric rates')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final admin = context.read<AdminProvider>();

    try {
      await admin.updateModelBilling(
        promptPerMillion: promptRate,
        completionPerMillion: completionRate,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Model billing rates updated successfully'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update rates: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.receipt_long_outlined, size: 20, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text(
                  'Model Billing Rates',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              'Token pricing used across platform analytics.',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: _isSaving ? null : _handleSave,
              icon: _isSaving
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.save, size: 16),
              label: Text(_isSaving ? 'Saving…' : 'Save'),
              style: ElevatedButton.styleFrom(visualDensity: VisualDensity.compact),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Active Model Banner
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.memory, color: AppTheme.primaryColor, size: 28),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _model ?? 'gemini-2.5-flash-lite',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, fontFamily: 'monospace'),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Provider: ${(_provider ?? 'google').toUpperCase()}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                ),
                              ),
                              if (_updatedAt != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  'Last updated: ${_updatedAt!.split('T').first}',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Rate Inputs
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Prompt Tokens Rate',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Cost per 1,000,000 input tokens (USD)',
                          style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _promptRateController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(
                            prefixText: '\$ ',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'Completion Tokens Rate',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Cost per 1,000,000 output tokens (USD)',
                          style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _completionRateController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(
                            prefixText: '\$ ',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Info card
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.info_outline, size: 18, color: AppTheme.primaryColor),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Updating model billing rates recalculates platform consumption costs and updates merchant cost metrics immediately.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
