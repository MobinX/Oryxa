import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/api_config.dart';
import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Operator editor for the hidden `product_info` helper subagent, plus a sandbox
/// preview that runs the draft currently in the box (saved or not).
class AdminSubagentScreen extends StatefulWidget {
  const AdminSubagentScreen({super.key});

  @override
  State<AdminSubagentScreen> createState() => _AdminSubagentScreenState();
}

class _AdminSubagentScreenState extends State<AdminSubagentScreen> {
  static const String key = 'product_info';
  static const int promptLimit = 20000;
  static const String sandboxSlug = 'oryxa-sandbox';

  final _promptController = TextEditingController();
  String? _savedPrompt;
  String? _defaultPrompt;
  String? _name;
  String? _description;
  bool _isDefault = true;
  bool _loading = true;
  bool _saving = false;
  String? _notice;
  bool _noticeError = false;

  String? _businessId;
  List<Map<String, dynamic>> _products = [];
  String? _productId;
  final _questionController = TextEditingController(text: 'Is this available, and how much is it?');
  bool _running = false;
  Map<String, dynamic>? _preview;
  String? _previewError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadSubagent();
      _loadSandbox();
    });
  }

  @override
  void dispose() {
    _promptController.dispose();
    _questionController.dispose();
    super.dispose();
  }

  Future<void> _loadSubagent() async {
    final subagent = await context.read<AdminProvider>().fetchSubagent(key);
    if (!mounted) return;
    if (subagent != null) {
      _savedPrompt = (subagent['systemPrompt'] ?? '').toString();
      _defaultPrompt = (subagent['defaultPrompt'] ?? '').toString();
      _promptController.text = _savedPrompt!;
      _name = subagent['name']?.toString();
      _description = subagent['description']?.toString();
      _isDefault = subagent['isDefault'] == true;
    }
    setState(() => _loading = false);
  }

  Future<void> _loadSandbox() async {
    final admin = context.read<AdminProvider>();
    try {
      final res = await admin.apiService.get(ApiConfig.pathBusinesses);
      final rows = res is List ? res : (res is Map && res['businesses'] is List ? res['businesses'] : []);
      Map<String, dynamic>? sandbox;
      for (final raw in rows) {
        if (raw is Map && (raw['slug'] ?? '').toString() == sandboxSlug) {
          sandbox = Map<String, dynamic>.from(raw);
          break;
        }
      }
      if (sandbox == null) return;
      final id = sandbox['id']?.toString();
      if (id == null) return;
      final productRes = await admin.apiService.get(ApiConfig.pathProducts(id, limit: 100));
      final products = productRes is Map && productRes['products'] is List
          ? (productRes['products'] as List)
              .map((p) => Map<String, dynamic>.from(p as Map))
              .toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _businessId = id;
        _products = products;
        if (products.isNotEmpty) _productId = products.first['id']?.toString();
      });
    } catch (e) {
      debugPrint('[Subagent] Sandbox unavailable: $e');
    }
  }

  bool get _dirty => _promptController.text.trim() != (_savedPrompt ?? '').trim();

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      final saved = await context.read<AdminProvider>().saveSubagent(key, _promptController.text);
      if (!mounted) return;
      setState(() {
        _savedPrompt = (saved?['systemPrompt'] ?? _promptController.text).toString();
        _notice = 'Saved. The next customer turn runs with this text.';
        _noticeError = false;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _notice = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
        _noticeError = true;
        _saving = false;
      });
    }
  }

  Future<void> _runPreview() async {
    if (_businessId == null || _productId == null || _questionController.text.trim().isEmpty) return;
    setState(() {
      _running = true;
      _previewError = null;
    });
    try {
      final res = await context.read<AdminProvider>().apiService.post(
            '/$_businessId/playground/product-info',
            body: {
              'productId': _productId,
              'userQuery': _questionController.text.trim(),
              if (_promptController.text.trim().isNotEmpty)
                'systemPrompt': _promptController.text.trim(),
            },
          );
      if (!mounted) return;
      setState(() {
        _preview = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
        _running = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _preview = null;
        _previewError = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
        _running = false;
      });
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
                const Icon(Icons.science_outlined, size: 20, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text('Subagent prompts',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    )),
              ],
            ),
            const SizedBox(height: 2),
            const Text('Helper agents read their text on every tool call.',
                style: TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                await Future.wait([_loadSubagent(), _loadSandbox()]);
              },
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_savedPrompt == null)
                    Card(
                      color: Colors.amber.withValues(alpha: 0.12),
                      child: const Padding(
                        padding: EdgeInsets.all(14),
                        child: Text(
                          'The API would not return the prompt, so nothing here is what customers are being answered with. Try again in a moment.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    )
                  else ...[
                    _card(
                      isDark,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(_name ?? 'Product info writer',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              ),
                              Chip(
                                label: Text(_isDefault ? 'Reviewed default' : 'Customised',
                                    style: const TextStyle(fontSize: 10)),
                                visualDensity: VisualDensity.compact,
                              ),
                            ],
                          ),
                          if (_description != null) ...[
                            const SizedBox(height: 4),
                            Text(_description!, style: const TextStyle(fontSize: 11, color: Colors.grey)),
                          ],
                          const SizedBox(height: 12),
                          const Text('System prompt',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(height: 4),
                          const Text(
                            'Read from the subagents table on every tool call. Changing it here does not touch the sales agent or any store.',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: _promptController,
                            maxLines: 20,
                            maxLength: promptLimit,
                            onChanged: (_) => setState(() {}),
                            style: const TextStyle(fontFamily: 'monospace', fontSize: 11, height: 1.4),
                            decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${_promptController.text.length} characters, limit $promptLimit'
                            '${_dirty ? ' · unsaved changes' : ''}',
                            style: const TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            children: [
                              ElevatedButton(
                                onPressed: _saving || _promptController.text.trim().isEmpty ? null : _save,
                                child: Text(_saving ? 'Saving…' : 'Save prompt'),
                              ),
                              OutlinedButton.icon(
                                onPressed: _saving || _defaultPrompt == null
                                    ? null
                                    : () {
                                        setState(() {
                                          _promptController.text = _defaultPrompt!;
                                          _notice = null;
                                        });
                                      },
                                icon: const Icon(Icons.restore, size: 15),
                                label: const Text('Restore reviewed default'),
                              ),
                            ],
                          ),
                          if (_notice != null) ...[
                            const SizedBox(height: 10),
                            Text(_notice!,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: _noticeError ? AppTheme.danger : const Color(0xFF10B981),
                                )),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _card(
                      isDark,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: const [
                              Icon(Icons.science_outlined, size: 18, color: AppTheme.primaryColor),
                              SizedBox(width: 8),
                              Text('Test the prompt', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Runs the same writer the tool runs, against a real product in the sandbox store. It uses the text currently in the box, so an unsaved draft can be tried first.',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                          const SizedBox(height: 12),
                          if (_businessId == null || _products.isEmpty)
                            const Text(
                              'No operator sandbox store or catalog was found, so there is nothing to test against. The editor above still saves.',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            )
                          else ...[
                            DropdownButtonFormField<String>(
                              value: _productId,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'Product', border: OutlineInputBorder(), isDense: true),
                              items: _products.map((p) => DropdownMenuItem<String>(
                                    value: p['id']?.toString(),
                                    child: Text(
                                      '${p['name'] ?? ''} · ${p['sku'] ?? ''}',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  )).toList(),
                              onChanged: (v) => setState(() => _productId = v),
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _questionController,
                              maxLength: 1000,
                              decoration: const InputDecoration(
                                labelText: 'Customer question',
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                            ),
                            const SizedBox(height: 10),
                            ElevatedButton.icon(
                              onPressed: _running || _questionController.text.trim().isEmpty ? null : _runPreview,
                              icon: const Icon(Icons.play_arrow, size: 16),
                              label: Text(_running ? 'Running…' : 'Run preview'),
                            ),
                            if (_previewError != null) ...[
                              const SizedBox(height: 10),
                              Text(_previewError!, style: const TextStyle(color: AppTheme.danger, fontSize: 12)),
                            ],
                            if (_preview != null) ...[
                              const SizedBox(height: 12),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${_preview!['provider'] ?? ''}/${_preview!['model'] ?? ''} · '
                                      '${_preview!['totalTokens'] ?? 0} tokens · '
                                      '\$${_preview!['estimatedCostUsd'] ?? 0} · '
                                      '${_preview!['latencyMs'] ?? 0} ms',
                                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                                    ),
                                    const SizedBox(height: 8),
                                    Text((_preview!['answer'] ?? '').toString(),
                                        style: const TextStyle(fontSize: 13)),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ],
                      ),
                    ),
                  ],
                ],
              ),
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
