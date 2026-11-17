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
  bool _isLoading = true;
  String _selectedMonth = '';
  List<String> _months = [];
  Map<String, dynamic>? _usageData;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _generateMonths();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  void _generateMonths() {
    final now = DateTime.now();
    _months = List.generate(6, (index) {
      final date = DateTime(now.year, now.month - index, 1);
      final monthStr = date.month.toString().padLeft(2, '0');
      return '${date.year}-$monthStr';
    });
    _selectedMonth = _months.first;
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();

    final results = await Future.wait([
      admin.fetchTokenUsage(month: _selectedMonth),
      admin.fetchAdminStats(),
    ]);

    if (mounted) {
      setState(() {
        _usageData = results[0] as Map<String, dynamic>?;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final businesses = (_usageData?['businesses'] as List? ?? [])
        .map((b) => Map<String, dynamic>.from(b as Map))
        .where((b) {
          if (_searchQuery.isEmpty) return true;
          final name = (b['name'] ?? b['businessName'] ?? '').toString().toLowerCase();
          return name.contains(_searchQuery.toLowerCase());
        })
        .toList();

    final totalTokens = _usageData?['totalTokens'] ?? _usageData?['total'] ?? 0;
    final totalCost = _usageData?['totalCost'] ?? _usageData?['costUsd'] ?? 0.0;
    final totalPromptTokens = _usageData?['totalPromptTokens'] ?? _usageData?['promptTokens'] ?? 0;
    final totalCompletionTokens = _usageData?['totalCompletionTokens'] ?? _usageData?['completionTokens'] ?? 0;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.memory_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Token Usage & Billing',
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
            'What the AI agent cost, store by store. Merchants see their chats and sales; the model bill is ours.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 14),

          // Month selector pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _months.map((m) {
                final isSelected = _selectedMonth == m;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(m, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                    selected: isSelected,
                    selectedColor: AppTheme.primaryColor.withValues(alpha: 0.2),
                    onSelected: (val) {
                      if (val && _selectedMonth != m) {
                        setState(() => _selectedMonth = m);
                        _loadData();
                      }
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          if (_isLoading) ...[
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          ] else ...[
            // Summary Cards Grid
            Row(
              children: [
                Expanded(
                  child: _buildMetricCard(
                    title: 'Total Cost',
                    value: '\$${(totalCost is num ? totalCost.toDouble() : 0.0).toStringAsFixed(3)}',
                    color: const Color(0xFF10B981),
                    icon: Icons.attach_money,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildMetricCard(
                    title: 'Total Tokens',
                    value: totalTokens.toString(),
                    color: AppTheme.primaryColor,
                    icon: Icons.memory,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _buildMetricCard(
                    title: 'Prompt Tokens',
                    value: totalPromptTokens.toString(),
                    color: Colors.blue,
                    icon: Icons.arrow_downward,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildMetricCard(
                    title: 'Completion Tokens',
                    value: totalCompletionTokens.toString(),
                    color: Colors.purple,
                    icon: Icons.arrow_upward,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Search Filter
            TextField(
              onChanged: (val) => setState(() => _searchQuery = val),
              decoration: InputDecoration(
                hintText: 'Search store name...',
                prefixIcon: const Icon(Icons.search, size: 18),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 12),

            // Store by Store Breakdown
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Store Breakdown', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                Text('${businesses.length} stores', style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary)),
              ],
            ),
            const SizedBox(height: 8),

            if (businesses.isEmpty)
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: Text('No store token usage recorded for this month.', style: TextStyle(fontSize: 12)),
                  ),
                ),
              )
            else
              ...businesses.map((b) {
                final name = (b['name'] ?? b['businessName'] ?? 'Store').toString();
                final bTotal = b['totalTokens'] ?? b['total'] ?? 0;
                final bCost = b['costUsd'] ?? b['cost'] ?? 0.0;
                final bRuns = b['runs'] ?? b['count'] ?? 0;

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              const SizedBox(height: 2),
                              Text(
                                '$bRuns agent turns',
                                style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '\$${(bCost is num ? bCost.toDouble() : 0.0).toStringAsFixed(3)}',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981), fontSize: 13),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '$bTotal tokens',
                              style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
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

  Widget _buildMetricCard({
    required String title,
    required String value,
    required Color color,
    required IconData icon,
    required bool isDark,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 14, color: color),
                const SizedBox(width: 4),
                Text(
                  title,
                  style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: color),
            ),
          ],
        ),
      ),
    );
  }
}
