import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

class AdminDefaultAgentScreen extends StatefulWidget {
  const AdminDefaultAgentScreen({super.key});

  @override
  State<AdminDefaultAgentScreen> createState() => _AdminDefaultAgentScreenState();
}

class _AdminDefaultAgentScreenState extends State<AdminDefaultAgentScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _systemPromptController = TextEditingController();
  final _replyGuidanceController = TextEditingController();
  final _commentGuidanceController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorMessage;
  String? _successMessage;

  Map<String, dynamic>? _agentData;
  Map<String, dynamic>? _overridesData;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  @override
  void dispose() {
    _tabController.dispose();
    _systemPromptController.dispose();
    _replyGuidanceController.dispose();
    _commentGuidanceController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final admin = context.read<AdminProvider>();
    final agent = await admin.fetchDefaultAgent();
    final overrides = await admin.fetchDefaultAgentOverrides();

    if (mounted) {
      if (agent != null) {
        _agentData = agent;
        _systemPromptController.text = (agent['systemPrompt'] ?? '').toString();
        _replyGuidanceController.text = (agent['replyGuidance'] ?? '').toString();
        _commentGuidanceController.text = (agent['commentReplyGuidance'] ?? '').toString();
      }
      _overridesData = overrides;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSave() async {
    final systemPrompt = _systemPromptController.text.trim();
    if (systemPrompt.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('System prompt is required')),
      );
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
      _successMessage = null;
    });

    try {
      final admin = context.read<AdminProvider>();
      final replyGuidance = _replyGuidanceController.text.trim();
      final commentGuidance = _commentGuidanceController.text.trim();

      await admin.updateDefaultAgent(
        systemPrompt: systemPrompt,
        replyGuidance: replyGuidance.isNotEmpty ? replyGuidance : null,
        commentReplyGuidance: commentGuidance.isNotEmpty ? commentGuidance : null,
      );

      if (mounted) {
        setState(() {
          _successMessage = 'Saved. Stores following the default will answer with it on customer’s next message.';
          _isSaving = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Default agent prompt updated successfully'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString().replaceFirst(RegExp(r'^Exception: '), '');
          _isSaving = false;
        });
      }
    }
  }

  Future<void> _handleRevertOverride(String agentId, String businessName) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revert to Default?'),
        content: Text('Revert "$businessName" to follow the platform default prompt? Its custom prompt will be set aside.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Revert')),
        ],
      ),
    );

    if (confirm == true) {
      final admin = context.read<AdminProvider>();
      final success = await admin.revertOverrideToDefault(agentId);
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('"$businessName" now follows the platform default.')),
        );
        _loadData();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final followingCount = (_overridesData?['following'] as num?)?.toInt() ?? 0;
    final overridesList = (_overridesData?['overrides'] as List?) ?? [];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.description_outlined, size: 20, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text(
                  'Default Agent & Prompts',
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
              'The prompt and wording every store follows across the platform.',
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
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            const Tab(text: 'Prompts & Guidance'),
            Tab(text: 'Fleet Overrides (${overridesList.length})'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                // TAB 1: PROMPTS & GUIDANCE
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_successMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          _successMessage!,
                          style: const TextStyle(fontSize: 13, color: Color(0xFF10B981), fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: AppTheme.dangerBg,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.danger.withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(fontSize: 13, color: AppTheme.danger, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],

                    // Card 1: System Prompt
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
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'System Prompt',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                Text(
                                  '${_systemPromptController.text.length} / 40,000 chars',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey, fontFamily: 'monospace'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Who the agent is and the sales rules it operates by. Required — a store with its own prompt keeps that instead.',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _systemPromptController,
                              maxLines: 12,
                              maxLength: 40000,
                              onChanged: (_) => setState(() {}),
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.4),
                              decoration: const InputDecoration(
                                hintText: 'Enter default system prompt…',
                                border: OutlineInputBorder(),
                                counterText: '',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Card 2: Messenger Wording
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
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Messenger Wording (Reply Guidance)',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                Text(
                                  '${_replyGuidanceController.text.length} / 12,000 chars',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey, fontFamily: 'monospace'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Wording guidance for customer DMs. Empty box automatically falls back to OnlyOrders reviewed guidance (Bangla reply rule & send-once rule).',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _replyGuidanceController,
                              maxLines: 6,
                              maxLength: 12000,
                              onChanged: (_) => setState(() {}),
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.4),
                              decoration: InputDecoration(
                                hintText: (_agentData?['guidanceDefaults']?['replyGuidance'] ?? 'Fallback guidance…').toString(),
                                border: const OutlineInputBorder(),
                                counterText: '',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Card 3: Public Comment Wording
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
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Public Comment Wording (Page Comments)',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                Text(
                                  '${_commentGuidanceController.text.length} / 12,000 chars',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey, fontFamily: 'monospace'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Guidance for automatic public comment replies on Facebook/Instagram posts.',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _commentGuidanceController,
                              maxLines: 6,
                              maxLength: 12000,
                              onChanged: (_) => setState(() {}),
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.4),
                              decoration: InputDecoration(
                                hintText: (_agentData?['guidanceDefaults']?['commentReplyGuidance'] ?? 'Fallback comment guidance…').toString(),
                                border: const OutlineInputBorder(),
                                counterText: '',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),

                // TAB 2: FLEET OVERRIDES
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Status banner
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: isDark ? Colors.white10 : Colors.black12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.storefront, color: AppTheme.primaryColor),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$followingCount stores following platform default',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Any store listed below has customized its own prompt and opted out of the fleet default.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (overridesList.isEmpty) ...[
                      Card(
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: const Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(
                            child: Text('All stores are currently following the platform default.'),
                          ),
                        ),
                      ),
                    ] else ...[
                      ...overridesList.map((item) {
                        final record = Map<String, dynamic>.from(item as Map);
                        final agentId = (record['id'] ?? '').toString();
                        final storeName = (record['businessName'] ?? 'Unknown Store').toString();
                        final chars = (record['systemPromptChars'] as num?)?.toInt() ?? 0;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                          ),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: Colors.amber.withValues(alpha: 0.2),
                              child: const Icon(Icons.edit_note, color: Colors.amber, size: 20),
                            ),
                            title: Text(storeName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            subtitle: Text('Custom prompt ($chars chars)', style: const TextStyle(fontSize: 12)),
                            trailing: OutlinedButton(
                              onPressed: () => _handleRevertOverride(agentId, storeName),
                              style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                              child: const Text('Revert to Default', style: TextStyle(fontSize: 11)),
                            ),
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ],
            ),
    );
  }
}
