import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';
import '../../../utils/admin_format.dart';

/// Parity with `apps/web/app/admin/model-billing/page.tsx`: summary tiles for the
/// current card, then a form with provider/model and three USD-per-million rates.
class AdminModelBillingScreen extends StatefulWidget {
  const AdminModelBillingScreen({super.key});

  @override
  State<AdminModelBillingScreen> createState() => _AdminModelBillingScreenState();
}

class _AdminModelBillingScreenState extends State<AdminModelBillingScreen> {
  final _providerController = TextEditingController();
  final _modelController = TextEditingController();
  final _inputController = TextEditingController();
  final _outputController = TextEditingController();
  final _cachedController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _updatedAt;
  Map<String, dynamic>? _current;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRates());
  }

  @override
  void dispose() {
    _providerController.dispose();
    _modelController.dispose();
    _inputController.dispose();
    _outputController.dispose();
    _cachedController.dispose();
    super.dispose();
  }

  Future<void> _loadRates() async {
    final data = await context.read<AdminProvider>().fetchModelBilling();
    if (!mounted) return;
    if (data != null) {
      _current = data;
      _providerController.text = (data['provider'] ?? '').toString();
      _modelController.text = (data['model'] ?? '').toString();
      _inputController.text = _rate(data['inputUsdPerMillion'], '0.075');
      _outputController.text = _rate(data['outputUsdPerMillion'], '0.30');
      _cachedController.text = _rate(data['cachedInputUsdPerMillion'], '0.01875');
      _updatedAt = data['updatedAt']?.toString();
    }
    setState(() => _isLoading = false);
  }

  static String _rate(dynamic value, String fallback) {
    if (value == null) return fallback;
    if (value is num) {
      final s = value.toString();
      return s;
    }
    return value.toString();
  }

  Future<void> _handleSave() async {
    final input = double.tryParse(_inputController.text.trim());
    final output = double.tryParse(_outputController.text.trim());
    final cached = double.tryParse(_cachedController.text.trim());
    if (_providerController.text.trim().isEmpty ||
        _modelController.text.trim().isEmpty ||
        input == null || output == null || cached == null ||
        input < 0 || output < 0 || cached < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a provider, a model and three rates of zero or greater')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      await context.read<AdminProvider>().updateModelBilling(
            provider: _providerController.text.trim(),
            model: _modelController.text.trim(),
            inputUsdPerMillion: input,
            outputUsdPerMillion: output,
            cachedInputUsdPerMillion: cached,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Rates saved. Token analytics has been repriced with the new card.'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        _loadRates();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save rates: $e'), backgroundColor: AppTheme.danger),
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
                Text('Model billing',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    )),
              ],
            ),
            const SizedBox(height: 2),
            const Text(
              'The token rates behind every price on the usage pages.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: _isSaving ? null : _handleSave,
              icon: _isSaving
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save, size: 16),
              label: Text(_isSaving ? 'Saving…' : 'Save rates'),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadRates,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_current == null)
                    Card(
                      color: AppTheme.dangerBg,
                      child: const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('The rate card could not be read.', style: TextStyle(color: AppTheme.danger)),
                      ),
                    )
                  else ...[
                    _card(
                      isDark,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('CURRENT RATE CARD',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                          const SizedBox(height: 6),
                          Text(
                            '${_current!['provider'] ?? ''} / ${_current!['model'] ?? ''}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          if (_updatedAt != null) ...[
                            const SizedBox(height: 4),
                            Text('updated $_updatedAt UTC', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                          ],
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(child: _tile('Input', _current!['inputUsdPerMillion'], 'fresh prompt tokens')),
                              const SizedBox(width: 8),
                              Expanded(child: _tile('Output', _current!['outputUsdPerMillion'], 'tokens the model writes')),
                              const SizedBox(width: 8),
                              Expanded(child: _tile('Cached input', _current!['cachedInputUsdPerMillion'], 'prompt-cache reads')),
                            ],
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Each number is US dollars per 1,000,000 tokens. Cached input applies to the part of a prompt the provider serves from cache.',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  _card(
                    isDark,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('RATE CARD', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        const Text('Which model these rates belong to. The console shows them beside every cost figure.',
                            style: TextStyle(fontSize: 11, color: Colors.grey)),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _providerController,
                          maxLength: 50,
                          decoration: const InputDecoration(
                            labelText: 'Provider',
                            hintText: 'openai',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _modelController,
                          maxLength: 100,
                          decoration: const InputDecoration(
                            labelText: 'Model',
                            hintText: 'gpt-6-luna',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _card(
                    isDark,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Price per 1,000,000 tokens',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        const Text('US dollars. Changing these reprices past months too.',
                            style: TextStyle(fontSize: 11, color: Colors.grey)),
                        const SizedBox(height: 12),
                        _rateField('Input', 'Fresh prompt tokens', _inputController),
                        const SizedBox(height: 12),
                        _rateField('Output', 'Tokens the model writes', _outputController),
                        const SizedBox(height: 12),
                        _rateField('Cached input', 'Prompt-cache reads', _cachedController),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Widget _rateField(String label, String hint, TextEditingController controller) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixText: '\$ ',
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }

  Widget _tile(String label, dynamic value, String hint) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(AdminFormat.tokenMoney(value is num ? value : num.tryParse(value.toString())),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(hint, style: const TextStyle(fontSize: 9, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _card(bool isDark, {required Widget child}) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: Padding(padding: const EdgeInsets.all(16), child: child),
    );
  }
}
