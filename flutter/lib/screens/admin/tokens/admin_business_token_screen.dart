import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';
import '../../../utils/admin_format.dart';

class AdminBusinessTokenScreen extends StatefulWidget {
  final String businessId;
  final String? initialBusinessName;
  final String? initialSlug;
  final String? initialMonth;

  const AdminBusinessTokenScreen({
    super.key,
    required this.businessId,
    this.initialBusinessName,
    this.initialSlug,
    this.initialMonth,
  });

  @override
  State<AdminBusinessTokenScreen> createState() => _AdminBusinessTokenScreenState();
}

class _AdminBusinessTokenScreenState extends State<AdminBusinessTokenScreen> {
  bool _isLoading = true;
  String _selectedMonth = '';
  List<String> _months = [];
  Map<String, dynamic>? _detailData;

  static const Map<String, String> _integrationLabels = {
    'facebook_messenger': 'Messenger reply',
    'facebook_comment': 'Comment reply',
    'instagram_messenger': 'Instagram DM',
    'instagram_comment': 'Instagram comment',
    'ai_post_generation': 'AI post generation',
    'ai_post_tuning': 'AI post tuning',
    'inbox_suggestion': 'Inbox AI suggestions',
  };

  @override
  void initState() {
    super.initState();
    _months = AdminFormat.recentMonths(4);
    _selectedMonth = widget.initialMonth ?? _months.first;
    if (!_months.contains(_selectedMonth)) {
      _months = [_selectedMonth, ..._months.take(3)];
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();
    final data = await admin.fetchBusinessTokenUsageDetail(
      widget.businessId,
      month: _selectedMonth,
    );

    if (mounted) {
      setState(() {
        _detailData = data;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final business = (_detailData?['business'] as Map?)?.cast<String, dynamic>() ?? {};
    final totals = (_detailData?['totals'] as Map?)?.cast<String, dynamic>() ?? {};
    final byIntegration = ((_detailData?['byIntegration'] as List?) ?? [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
    final daily = ((_detailData?['daily'] as List?) ?? [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();

    final storeName = (business['name'] ?? widget.initialBusinessName ?? 'Store').toString();
    final slug = (business['slug'] ?? widget.initialSlug)?.toString();
    final runCount = totals['runCount'] as num? ?? 0;
    final startTime = (_detailData?['startTime'] ?? '').toString();
    final endTime = (_detailData?['endTime'] ?? '').toString();

    // Calculate max totalTokens in daily points for bar chart scaling
    int maxDailyTokens = 1;
    for (final day in daily) {
      final t = (day['totalTokens'] as num? ?? 0).toInt();
      if (t > maxDailyTokens) maxDailyTokens = t;
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              storeName,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${slug ?? 'no store published'} · ${AdminFormat.monthLabel(_selectedMonth)} · ${AdminFormat.whole(runCount)} agent runs',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
              ),
            ),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Month Selector Pills
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
                  padding: EdgeInsets.all(48),
                  child: CircularProgressIndicator(),
                ),
              ),
            ] else if (_detailData == null) ...[
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      const Icon(Icons.warning_amber_rounded, size: 36, color: AppTheme.danger),
                      const SizedBox(height: 10),
                      const Text(
                        'Unable to load store token usage',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Could not retrieve usage detail from /api2/admin/token-analytics/businesses/${widget.businessId}',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        child: const Text('Try Again'),
                      ),
                    ],
                  ),
                ),
              ),
            ] else ...[
              // 8 KPI Cards Grid (2 per row)
              Row(
                children: [
                  Expanded(
                    child: _buildKpiCard(
                      label: 'TOTAL TOKENS',
                      value: AdminFormat.whole(totals['totalTokens'] as num?),
                      sub: '${AdminFormat.compact(totals['inputTokens'] as num?)} in · ${AdminFormat.compact(totals['outputTokens'] as num?)} out',
                      icon: Icons.memory,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildKpiCard(
                      label: 'CACHE HIT',
                      value: '${((totals['cacheHitPercent'] as num?)?.toDouble() ?? 0.0).toStringAsFixed(1)}%',
                      sub: '${AdminFormat.whole(totals['cacheHitTokens'] as num?)} cached of ${AdminFormat.whole(totals['inputTokens'] as num?)} input',
                      icon: Icons.bolt,
                      iconColor: Colors.amber,
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
                      label: 'CACHE MISS',
                      value: AdminFormat.whole(totals['cacheMissTokens'] as num?),
                      sub: 'input tokens re-read in full',
                      icon: Icons.error_outline,
                      iconColor: Colors.orange,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildKpiCard(
                      label: 'AVG TOKENS / RUN',
                      value: AdminFormat.whole(((totals['avgTokensPerRun'] as num?)?.toDouble() ?? 0.0).round()),
                      sub: '${AdminFormat.whole(totals['runCount'] as num?)} runs this month',
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
                      label: 'INPUT TOKENS',
                      value: AdminFormat.whole(totals['inputTokens'] as num?),
                      sub: 'prompt, tools and history sent',
                      icon: Icons.arrow_downward,
                      iconColor: Colors.blue,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildKpiCard(
                      label: 'OUTPUT TOKENS',
                      value: AdminFormat.whole(totals['outputTokens'] as num?),
                      sub: 'what the model wrote back',
                      icon: Icons.arrow_upward,
                      iconColor: Colors.purple,
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
                      label: 'AVG LATENCY',
                      value: '${AdminFormat.whole(totals['avgLatencyMs'] as num?)} ms',
                      sub: 'weighted by runs, not by day',
                      icon: Icons.timer_outlined,
                      iconColor: Colors.teal,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildKpiCard(
                      label: 'ESTIMATED COST',
                      value: AdminFormat.tokenMoney(totals['estimatedCostUsd'] as num?),
                      sub: 'from the hourly rollup, so a floor',
                      icon: Icons.receipt_outlined,
                      iconColor: const Color(0xFF10B981),
                      isDark: isDark,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Pipeline Breakdown Card
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
                        'Which pipeline spent it',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'One row per integration type in hourly_token_analytics.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (byIntegration.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: Column(
                              children: [
                                const Icon(Icons.smart_toy_outlined, size: 32, color: Colors.grey),
                                const SizedBox(height: 8),
                                const Text(
                                  'Nothing ran here',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Nothing ran for this store in ${AdminFormat.monthLabel(_selectedMonth)}.',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        ...byIntegration.map((row) {
                          final itype = row['integrationType']?.toString() ?? 'unknown';
                          final label = _integrationLabels[itype] ?? itype;
                          final cost = AdminFormat.tokenMoney(row['estimatedCostUsd'] as num?);
                          final tokens = AdminFormat.whole(row['totalTokens'] as num?);
                          final inTokens = AdminFormat.whole(row['inputTokens'] as num?);
                          final outTokens = AdminFormat.whole(row['outputTokens'] as num?);
                          final runs = AdminFormat.whole(row['runCount'] as num?);
                          final hitPercent = ((row['cacheHitPercent'] as num?)?.toDouble() ?? 0.0).toStringAsFixed(1);
                          final avgRun = AdminFormat.whole(((row['avgTokensPerRun'] as num?)?.toDouble() ?? 0.0).round());

                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.02),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: isDark ? Colors.white10 : Colors.black12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      label,
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    ),
                                    Text(
                                      cost,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                        color: Color(0xFF10B981),
                                        fontFamily: 'monospace',
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Flexible(
                                      child: Text(
                                        '$runs runs · $tokens tokens ($inTokens in / $outTokens out)',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Flexible(
                                      child: Text(
                                        'Hit: $hitPercent% · Avg: $avgRun',
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
                          );
                        }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Day by Day Breakdown Card
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
                        'Day by day',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'UTC days, because the rollup buckets in UTC hours. Only days that ran appear.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (daily.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: Text(
                              'No daily breakdown recorded for this month.',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ),
                        )
                      else
                        ...daily.map((day) {
                          final date = day['date']?.toString() ?? '';
                          final tTokens = (day['totalTokens'] as num? ?? 0).toInt();
                          final dRuns = day['runCount'] as num? ?? 0;
                          final dCost = AdminFormat.tokenMoney(day['estimatedCostUsd'] as num?);
                          final ratio = (tTokens / maxDailyTokens).clamp(0.02, 1.0);

                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Fixed table columns are wider than a phone viewport,
                                // so let the row scroll instead of overflowing the card.
                                SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    children: [
                                      SizedBox(
                                        width: 90,
                                        child: Text(
                                          date,
                                          style: TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      SizedBox(
                                        width: 80,
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(4),
                                          child: LinearProgressIndicator(
                                            value: ratio,
                                            minHeight: 8,
                                            backgroundColor: isDark ? Colors.white10 : Colors.black12,
                                            color: AppTheme.primaryColor,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      SizedBox(
                                        width: 75,
                                        child: Text(
                                          AdminFormat.whole(tTokens),
                                          textAlign: TextAlign.right,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      SizedBox(
                                        width: 50,
                                        child: Text(
                                          '${AdminFormat.whole(dRuns)}r',
                                          textAlign: TextAlign.right,
                                          style: TextStyle(
                                            fontSize: 10,
                                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      SizedBox(
                                        width: 65,
                                        child: Text(
                                          dCost,
                                          textAlign: TextAlign.right,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: Color(0xFF10B981),
                                            fontFamily: 'monospace',
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // Window Footer Note
              Text(
                'Window ${startTime.length >= 10 ? startTime.substring(0, 10) : ''} → ${endTime.length >= 10 ? endTime.substring(0, 10) : ''} UTC. The numbers can lag a live run by a few minutes: the rollup is written by the agent, outside this app, so nothing expires this cache.',
                style: TextStyle(
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                ),
              ),
            ],
          ],
        ),
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
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
                letterSpacing: -0.5,
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
