import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../config/app_theme.dart';
import '../../../../providers/admin_provider.dart';

class AdminOfficialProspectsScreen extends StatefulWidget {
  const AdminOfficialProspectsScreen({super.key});

  @override
  State<AdminOfficialProspectsScreen> createState() => _AdminOfficialProspectsScreenState();
}

class _AdminOfficialProspectsScreenState extends State<AdminOfficialProspectsScreen> {
  bool _isLoading = true;
  String _statusFilter = 'all';
  List<Map<String, dynamic>> _prospects = [];
  Map<String, dynamic> _weights = {};

  bool _isSavingWeights = false;
  final Map<String, TextEditingController> _weightControllers = {};

  static const List<String> _statuses = [
    'all',
    'new',
    'reviewing',
    'prioritized',
    'onboarding_requested',
    'onboarded',
    'rejected',
  ];

  static const List<String> _weightKeys = [
    'name',
    'country',
    'businessType',
    'employeesEstimate',
    'budget',
    'needs',
  ];

  @override
  void initState() {
    super.initState();
    for (final key in _weightKeys) {
      _weightControllers[key] = TextEditingController(text: '1');
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadProspects());
  }

  @override
  void dispose() {
    for (final ctrl in _weightControllers.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  Future<void> _loadProspects() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();
    final result = await admin.fetchOfficialProspects(
      status: _statusFilter == 'all' ? null : _statusFilter,
    );

    if (mounted) {
      _prospects = result['prospects'] as List<Map<String, dynamic>>;
      _weights = result['weights'] as Map<String, dynamic>;
      for (final key in _weightKeys) {
        if (_weights.containsKey(key)) {
          _weightControllers[key]?.text = _weights[key].toString();
        }
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSaveWeights() async {
    setState(() => _isSavingWeights = true);
    final admin = context.read<AdminProvider>();

    final Map<String, dynamic> payload = {};
    for (final key in _weightKeys) {
      final val = int.tryParse(_weightControllers[key]?.text ?? '1');
      if (val != null) payload[key] = val;
    }

    final ok = await admin.saveOfficialWeights(payload);
    if (mounted) {
      setState(() => _isSavingWeights = false);
      if (ok) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Weights saved and prospects re-scored'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        _loadProspects();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to save weights'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handleUpdateStatus(Map<String, dynamic> prospect) async {
    final prospectId = (prospect['id'] ?? '').toString();
    String currentStatus = (prospect['status'] ?? 'new').toString();
    final notesController = TextEditingController(text: (prospect['notes'] ?? '').toString());

    final updated = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Update Prospect'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pipeline Status', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  value: currentStatus,
                  isDense: true,
                  decoration: InputDecoration(
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  ),
                  items: _statuses
                      .where((s) => s != 'all')
                      .map((s) => DropdownMenuItem(value: s, child: Text(s.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 12))))
                      .toList(),
                  onChanged: (val) {
                    if (val != null) setDialogState(() => currentStatus = val);
                  },
                ),
                const SizedBox(height: 12),
                const Text('Notes', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                TextField(
                  controller: notesController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Onboarding feedback or notes...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.all(10),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
              child: const Text('Update', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );

    if (updated == true && mounted) {
      final admin = context.read<AdminProvider>();
      final ok = await admin.updateOfficialProspectStatus(
        prospectId,
        currentStatus,
        notes: notesController.text.trim(),
      );
      if (mounted) {
        if (ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Prospect status updated'), backgroundColor: Color(0xFF10B981)),
          );
          _loadProspects();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to update prospect'), backgroundColor: AppTheme.danger),
          );
        }
      }
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'new':
        return Colors.blue;
      case 'reviewing':
        return Colors.amber;
      case 'prioritized':
        return Colors.purple;
      case 'onboarding_requested':
        return Colors.orange;
      case 'onboarded':
        return const Color(0xFF10B981);
      case 'rejected':
        return AppTheme.danger;
      default:
        return AppTheme.primaryColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return RefreshIndicator(
      onRefresh: _loadProspects,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.people_outline, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Merchant Prospects',
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
            'People the official AI is onboarding: fields recorded from direct chat, and consent logged when agreed.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 12),

          // Status filter pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _statuses.map((status) {
                final isSelected = _statusFilter == status;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(
                      status.replaceAll('_', ' '),
                      style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal),
                    ),
                    selected: isSelected,
                    selectedColor: AppTheme.primaryColor.withValues(alpha: 0.2),
                    onSelected: (val) {
                      if (val) {
                        setState(() => _statusFilter = status);
                        _loadProspects();
                      }
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          // Scoring weights expansion card
          ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 16),
            collapsedShape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
            ),
            title: const Text('Scoring Weights', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            subtitle: Text(
              'Points per field provided. Re-scores all live prospects.',
              style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  children: [
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 2.8,
                      children: _weightKeys.map((key) {
                        return TextField(
                          controller: _weightControllers[key],
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: key,
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isSavingWeights ? null : _handleSaveWeights,
                        icon: _isSavingWeights
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.tune, size: 16),
                        label: Text(_isSavingWeights ? 'Saving...' : 'Save Weights & Re-score'),
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor, foregroundColor: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_isLoading) ...[
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          ] else if (_prospects.isEmpty) ...[
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Icon(Icons.people_outline, size: 48, color: isDark ? Colors.white24 : Colors.black26),
                    const SizedBox(height: 12),
                    const Text('No prospects in this stage', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(
                      'As prospective merchants message official channels, their lead profile lands here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            ..._prospects.map((prospect) {
              final name = (prospect['name'] ?? 'Inbound lead').toString();
              final status = (prospect['status'] ?? 'new').toString();
              final score = prospect['score'] ?? 0;
              final country = prospect['country']?.toString();
              final businessType = prospect['businessType']?.toString();
              final employees = prospect['employeesEstimate']?.toString();
              final budget = prospect['budget']?.toString();
              final needs = prospect['needs']?.toString();
              final consent = prospect['consent'] == true;
              final consentAt = prospect['consentAt']?.toString();

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              status.replaceAll('_', ' ').toUpperCase(),
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: _statusColor(status)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'Score: $score',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      if (businessType != null || country != null) ...[
                        Text(
                          '${businessType ?? "Store"} ${country != null ? "· $country" : ""}',
                          style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                        ),
                        const SizedBox(height: 4),
                      ],

                      if (budget != null || employees != null) ...[
                        Text(
                          '${employees != null ? "Team: $employees" : ""} ${budget != null ? "· Budget: $budget" : ""}',
                          style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                        ),
                        const SizedBox(height: 4),
                      ],

                      if (needs != null) ...[
                        const SizedBox(height: 4),
                        Text('Needs: $needs', style: const TextStyle(fontSize: 12)),
                      ],

                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            consent ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 14,
                            color: consent ? const Color(0xFF10B981) : Colors.grey,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            consent
                                ? 'Consent given ${consentAt != null ? consentAt.split("T").first : ""}'
                                : 'Consent pending',
                            style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                          ),
                        ],
                      ),

                      const Divider(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () => _handleUpdateStatus(prospect),
                            icon: const Icon(Icons.edit, size: 13),
                            label: const Text('Update Status', style: TextStyle(fontSize: 11)),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              minimumSize: Size.zero,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}
