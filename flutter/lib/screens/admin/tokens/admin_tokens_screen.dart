import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';
import '../../../utils/admin_format.dart';
import 'admin_business_token_screen.dart';

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
    _months = AdminFormat.recentMonths(4);
    _selectedMonth = _months.first;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();

    final data = await admin.fetchTokenUsage(month: _selectedMonth);

    if (mounted) {
      setState(() {
        _usageData = data;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final platform = (_usageData?['platform'] as Map?)?.cast<String, dynamic>() ?? {};
    final rawBusinesses = (_usageData?['businesses'] as List? ?? [])
        .map((b) => (b as Map).cast<String, dynamic>())
        .toList();

    final businesses = rawBusinesses.where((b) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      final name = (b['name'] ?? '').toString().toLowerCase();
      final slug = (b['slug'] ?? '').toString().toLowerCase();
      return name.contains(q) || slug.contains(q);
    }).toList();

    final storesCount = platform['businesses'] as num? ?? rawBusinesses.length;
    final totalRuns = platform['runCount'] as num? ?? 0;
    final avgTokensPerRun = platform['avgTokensPerRun'] as num? ?? 0;
    final totalTokens = platform['totalTokens'] as num? ?? 0;
    final inputTokens = platform['inputTokens'] as num? ?? 0;
    final outputTokens = platform['outputTokens'] as num? ?? 0;
    final cacheHitPercent = (platform['cacheHitPercent'] as num?)?.toDouble() ?? 0.0;
    final cacheHitTokens = platform['cacheHitTokens'] as num? ?? 0;
    final estimatedCostUsd = platform['estimatedCostUsd'] as num? ?? 0.0;

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
                'Token usage',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'What the agent cost, store by store. Merchants see their own chats and sales; the model bill is ours.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 14),

          // Month selector pills (clones AdminMonthPills)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _months.map((m) {
                final isSelected = _selectedMonth == m;
                final label = m == _months.first ? 'This month' : AdminFormat.monthLabel(m);
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(
                      label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
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
            const Center(
              child: Padding(
                padding: EdgeInsets.all(40),
                child: CircularProgressIndicator(),
              ),
            ),
          ] else if (_usageData == null) ...[
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: const BorderSide(color: AppTheme.danger, width: 1.5),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 36, color: AppTheme.danger),
                    const SizedBox(height: 10),
                    const Text(
                      'The usage did not load',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.danger),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'This page reads /api2/admin/token-analytics/businesses, which needs the console session.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton(
                      onPressed: _loadData,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            // 5 KPI Cards (Clones Web Grid)
            Row(
              children: [
                Expanded(
                  child: _buildKpiCard(
                    label: 'STORES USING AGENT',
                    value: AdminFormat.whole(storesCount),
                    sub: AdminFormat.monthLabel(_selectedMonth),
                    icon: Icons.store_outlined,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildKpiCard(
                    label: 'AGENT RUNS',
                    value: AdminFormat.whole(totalRuns),
                    sub: '${AdminFormat.whole(avgTokensPerRun)} tokens per run',
                    icon: Icons.smart_toy_outlined,
                    iconColor: Colors.indigoAccent,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _buildKpiCard(
                    label: 'TOTAL TOKENS',
                    value: AdminFormat.compact(totalTokens),
                    sub: '${AdminFormat.compact(inputTokens)} in · ${AdminFormat.compact(outputTokens)} out',
                    icon: Icons.memory_outlined,
                    iconColor: Colors.blue,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildKpiCard(
                    label: 'CACHE HITS',
                    value: '${cacheHitPercent.toStringAsFixed(1)}%',
                    sub: '${AdminFormat.compact(cacheHitTokens)} of input from cache',
                    icon: Icons.bolt,
                    iconColor: Colors.amber,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _buildKpiCard(
              label: 'ESTIMATED COST',
              value: AdminFormat.tokenMoney(estimatedCostUsd),
              sub: 'from the hourly rollup, so a floor',
              icon: Icons.receipt_outlined,
              iconColor: const Color(0xFF10B981),
              isDark: isDark,
              isLarge: true,
            ),
            const SizedBox(height: 18),

            // Every Store That Spent Tokens Section
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
                          'Every store that spent tokens',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        Text(
                          '${businesses.length} stores',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Ranked by tokens, ${AdminFormat.monthLabel(_selectedMonth)}. A store with no usage this month is absent.',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Store Search Box
                    TextField(
                      onChanged: (val) => setState(() => _searchQuery = val),
                      decoration: InputDecoration(
                        hintText: 'Filter store name or slug…',
                        prefixIcon: const Icon(Icons.search, size: 18),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 14),

                    if (businesses.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Center(
                          child: Column(
                            children: [
                              const Icon(Icons.memory_outlined, size: 36, color: Colors.grey),
                              const SizedBox(height: 10),
                              const Text(
                                'No spend this month',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Nothing was spent in ${AdminFormat.monthLabel(_selectedMonth)}.',
                                style: const TextStyle(fontSize: 12, color: Colors.grey),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      ...businesses.map((b) {
                        final businessId = (b['businessId'] ?? '').toString();
                        final name = (b['name'] ?? 'Store').toString();
                        final slug = b['slug']?.toString();
                        final bTotal = b['totalTokens'] as num? ?? 0;
                        final bRuns = b['runCount'] as num? ?? 0;
                        final bCost = b['estimatedCostUsd'] as num? ?? 0.0;
                        final bIn = b['inputTokens'] as num? ?? 0;
                        final bOut = b['outputTokens'] as num? ?? 0;
                        final bHit = (b['cacheHitPercent'] as num?)?.toDouble() ?? 0.0;
                        final bAvg = (b['avgTokensPerRun'] as num?)?.toDouble() ?? 0.0;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          decoration: BoxDecoration(
                            color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.02),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: isDark ? Colors.white10 : Colors.black12),
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: businessId.isEmpty
                                ? null
                                : () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => AdminBusinessTokenScreen(
                                          businessId: businessId,
                                          initialBusinessName: name,
                                          initialSlug: slug,
                                          initialMonth: _selectedMonth,
                                        ),
                                      ),
                                    );
                                  },
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Flexible(
                                                  child: Text(
                                                    name,
                                                    style: const TextStyle(
                                                      fontWeight: FontWeight.bold,
                                                      fontSize: 13,
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 4),
                                                const Icon(Icons.chevron_right, size: 16, color: Colors.grey),
                                              ],
                                            ),
                                            Text(
                                              slug ?? 'no store published',
                                              style: TextStyle(
                                                fontFamily: 'monospace',
                                                fontSize: 11,
                                                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            AdminFormat.tokenMoney(bCost),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14,
                                              color: Color(0xFF10B981),
                                              fontFamily: 'monospace',
                                            ),
                                          ),
                                          Text(
                                            '${AdminFormat.whole(bRuns)} runs',
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          'Tokens: ${AdminFormat.whole(bTotal)} (${AdminFormat.whole(bIn)} in / ${AdminFormat.whole(bOut)} out)',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Flexible(
                                        child: Text(
                                          'Hit: ${bHit.toStringAsFixed(1)}% · Avg: ${AdminFormat.whole(bAvg.round())}',
                                          textAlign: TextAlign.end,
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Web-matching Footer Note
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark ? Colors.white.withValues(alpha: 0.02) : Colors.black.withValues(alpha: 0.02),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.trending_up, size: 16, color: AppTheme.primaryColor),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Read from hourly_token_analytics, which the agent writes after every run. Deleted stores keep their rows but leave this list, so this month can sum to less than the /admin tile. The window is a calendar month in UTC, and numbers lag live runs by a few minutes.',
                      style: TextStyle(
                        fontSize: 11,
                        height: 1.35,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildKpiCard({
    required String label,
    required String value,
    required String sub,
    required IconData icon,
    Color? iconColor,
    required bool isDark,
    bool isLarge = false,
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
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                    ),
                  ),
                ),
                Icon(icon, size: 16, color: iconColor ?? AppTheme.primaryColor),
              ],
            ),
            SizedBox(height: isLarge ? 6 : 8),
            Text(
              value,
              style: TextStyle(
                fontSize: isLarge ? 22 : 18,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
                letterSpacing: -0.5,
                color: iconColor != null && isLarge ? iconColor : null,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              sub,
              style: TextStyle(
                fontSize: 10,
                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
