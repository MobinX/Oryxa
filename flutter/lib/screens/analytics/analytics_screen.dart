import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../models/analytics_data.dart';
import '../../providers/business_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/app_card.dart';
import '../orders/orders_screen.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  int _selectedDays = 30;
  AnalyticsData? _data;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAnalytics();
    });
  }

  Future<void> _loadAnalytics() async {
    final biz = context.read<BusinessProvider>();
    if (biz.currentBusiness == null) return;
    final bId = biz.currentBusiness!.id;
    final api = context.read<ApiService>();

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final results = await Future.wait([
        api.get(ApiConfig.pathBusinessAnalytics(bId, days: _selectedDays)),
        api.get(ApiConfig.pathBilling(bId)).catchError((_) => null),
        api.get(ApiConfig.pathTokenAnalytics(bId, hours: _selectedDays * 24)).catchError((_) => null),
      ]);

      final analyticsJson = results[0] as Map<String, dynamic>?;
      final billingJson = results[1] as Map<String, dynamic>?;
      final tokensJson = results[2] as Map<String, dynamic>?;

      if (analyticsJson != null) {
        final parsed = AnalyticsData.fromJson(
          analyticsJson,
          billingJson: billingJson,
          tokenAnalyticsJson: tokensJson,
        );
        if (mounted) {
          setState(() {
            _data = parsed;
            _isLoading = false;
          });
        }
      } else {
        throw Exception('Empty analytics response');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          if (_data == null) {
            _data = AnalyticsData.mock();
            _errorMessage = 'Showing sample preview. Connect channels for live data.';
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to load live data: $e')),
            );
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final d = _data;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Analytics',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh analytics',
            onPressed: _isLoading ? null : _loadAnalytics,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAnalytics,
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Header Description & Window Selector
            _buildWindowHeader(isDark),
            const SizedBox(height: 16),

            if (_errorMessage != null)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.warningBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.warning.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded, color: AppTheme.warning, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF92400E),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // SECTION 1: WINDOW METRICS
            if (_isLoading && d == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (d != null) ...[
              _buildMetricsGrid(d, isDark),
              const SizedBox(height: 16),

              // Billing Quota Card (if active)
              if (d.quota != null) ...[
                _buildQuotaCard(d.quota!, isDark),
                const SizedBox(height: 16),
              ],

              // SECTION 2: DAILY ACTIVITY (CHART)
              _buildActivityChartCard(d, isDark),
              const SizedBox(height: 16),

              // SECTION 3: ORDERS BY STATE
              _buildOrdersByStateCard(d, isDark),
              const SizedBox(height: 16),

              // SECTION 4: AI TOKEN & AGENT INTELLIGENCE
              if (d.tokenTotals != null && d.tokenTotals!.totalRuns > 0) ...[
                _buildTokenIntelligenceCard(d.tokenTotals!, isDark),
                const SizedBox(height: 16),
              ],

              // SECTION 5: LIFETIME STATS (Since store opened)
              _buildLifetimeStatsCard(d.totals, isDark),
              const SizedBox(height: 24),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildWindowHeader(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Window Overview',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Last $_selectedDays days vs previous period',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                    ),
                  ),
                ],
              ),
            ),
            // Pill window selector (7d, 30d, 90d)
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
              padding: const EdgeInsets.all(3),
              child: Row(
                children: [7, 30, 90].map((days) {
                  final isSel = _selectedDays == days;
                  return GestureDetector(
                    onTap: () {
                      if (_selectedDays != days) {
                        setState(() => _selectedDays = days);
                        _loadAnalytics();
                      }
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSel
                            ? (isDark ? AppTheme.surfaceDark : Colors.white)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(9),
                        boxShadow: isSel && !isDark
                            ? [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 4,
                                  offset: const Offset(0, 1),
                                ),
                              ]
                            : null,
                      ),
                      child: Text(
                        '${days}d',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSel ? FontWeight.bold : FontWeight.w500,
                          color: isSel
                              ? (isDark ? Colors.white : AppTheme.primaryColor)
                              : (isDark ? Colors.grey.shade400 : Colors.grey.shade600),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildMetricsGrid(AnalyticsData d, bool isDark) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cardWidth = (constraints.maxWidth - 12) / 2;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                label: 'Customer messages',
                value: '${d.messages.current}',
                delta: d.messages.delta,
                icon: Icons.forum_outlined,
                iconColor: AppTheme.primaryColor,
                isDark: isDark,
              ),
            ),
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                label: 'Conversations',
                value: '${d.conversations.current}',
                delta: d.conversations.delta,
                icon: Icons.chat_bubble_outline_rounded,
                iconColor: const Color(0xFF3B82F6),
                isDark: isDark,
              ),
            ),
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                label: 'Orders',
                value: '${d.orders.current}',
                delta: d.orders.delta,
                icon: Icons.shopping_bag_outlined,
                iconColor: const Color(0xFF10B981),
                isDark: isDark,
              ),
            ),
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                label: 'Revenue',
                value: '৳${d.revenue.current.toStringAsFixed(0)}',
                delta: d.revenue.delta,
                icon: Icons.monetization_on_outlined,
                iconColor: const Color(0xFF8B5CF6),
                isDark: isDark,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMetricCard({
    required String label,
    required String value,
    required Delta? delta,
    required IconData icon,
    required Color iconColor,
    required bool isDark,
  }) {
    Color deltaColor = Colors.grey;
    Color deltaBg = Colors.grey.withValues(alpha: 0.12);

    if (delta != null) {
      switch (delta.tone) {
        case DeltaTone.up:
          deltaColor = AppTheme.success;
          deltaBg = AppTheme.successBg;
          break;
        case DeltaTone.down:
          deltaColor = AppTheme.danger;
          deltaBg = AppTheme.dangerBg;
          break;
        case DeltaTone.flat:
          deltaColor = Colors.grey;
          deltaBg = Colors.grey.withValues(alpha: 0.12);
          break;
      }
    }

    return AppCard(
      padding: const EdgeInsets.all(14),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: iconColor, size: 16),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
              color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  width: 0.8,
                ),
              ),
            ),
            child: Row(
              children: [
                if (delta != null) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: deltaBg,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      delta.text,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: deltaColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 5),
                ],
                Expanded(
                  child: Text(
                    'vs prev',
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuotaCard(QuotaOverview q, bool isDark) {
    final remaining = q.messagesRemaining;
    final isBlocked = q.messageBlocked;
    final isNearLimit = q.messageLimit != null && (q.messagesUsed / q.messageLimit!) >= 0.8;

    Color statusColor = AppTheme.primaryColor;
    if (isBlocked) {
      statusColor = AppTheme.danger;
    } else if (isNearLimit) {
      statusColor = AppTheme.warning;
    }

    return AppCard(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'REPLIES LEFT THIS CYCLE',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.layers_outlined, color: AppTheme.primaryColor, size: 16),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            remaining == null ? 'Uncapped' : '$remaining',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: statusColor,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Comments: ${q.commentLimit == null ? "uncapped" : "${q.commentsUsed}/${q.commentLimit}"}',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                ),
              ),
              Text(
                '${q.daysLeft}d to reset',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            q.assigned ? q.planName : 'No plan — unlimited',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityChartCard(AnalyticsData d, bool isDark) {
    final series = d.dailySeries;
    final hasActivity = d.hasActivity;

    return AppCard(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Every day in the window',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Customer messages & orders over time',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  _buildLegendIndicator(AppTheme.primaryColor, 'Messages'),
                  const SizedBox(width: 10),
                  _buildLegendIndicator(const Color(0xFF10B981), 'Orders'),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),

          if (!hasActivity || series.isEmpty)
            Container(
              height: 180,
              width: double.infinity,
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.02)
                    : Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : Colors.grey.shade200,
                  style: BorderStyle.solid,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.chat_bubble_outline_rounded,
                    size: 32,
                    color: isDark ? Colors.grey.shade600 : Colors.grey.shade400,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No customer wrote in during this window',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Connect a page to start recording daily activity',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.grey.shade600 : Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            )
          else ...[
            SizedBox(
              height: 190,
              child: BarChart(
                BarChartData(
                  alignment: BarChartAlignment.spaceAround,
                  maxY: (d.maxDailyActivity * 1.25).ceilToDouble(),
                  gridData: const FlGridData(show: false),
                  borderData: FlBorderData(show: false),
                  titlesData: const FlTitlesData(
                    leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  ),
                  barTouchData: BarTouchData(
                    enabled: true,
                    touchTooltipData: BarTouchTooltipData(
                      getTooltipColor: (_) => const Color(0xFF0F172A),
                      tooltipPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      tooltipRoundedRadius: 8,
                      getTooltipItem: (group, groupIndex, rod, rodIndex) {
                        if (groupIndex < 0 || groupIndex >= series.length) return null;
                        final day = series[groupIndex];
                        if (rodIndex != 0 && day.messages > 0) return null;
                        return BarTooltipItem(
                          '${day.date}\n',
                          const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                          ),
                          children: [
                            TextSpan(
                              text: 'Messages: ${day.messages}\n',
                              style: const TextStyle(
                                color: Color(0xFFA5B4FC),
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            TextSpan(
                              text: 'Orders: ${day.orders}\n',
                              style: const TextStyle(
                                color: Color(0xFF6EE7B7),
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            TextSpan(
                              text: 'Revenue: ৳${day.revenue.toStringAsFixed(0)}',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  barGroups: series.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final day = entry.value;
                    final rodWidth = _selectedDays == 7
                        ? 10.0
                        : (_selectedDays == 30 ? 3.5 : 1.5);
                    final barsSpace = _selectedDays == 7
                        ? 4.0
                        : (_selectedDays == 30 ? 1.5 : 0.8);

                    return BarChartGroupData(
                      x: idx,
                      barsSpace: barsSpace,
                      barRods: [
                        BarChartRodData(
                          toY: day.messages.toDouble(),
                          color: AppTheme.primaryColor,
                          width: rodWidth,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                        ),
                        BarChartRodData(
                          toY: day.orders.toDouble(),
                          color: const Color(0xFF10B981),
                          width: rodWidth,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                        ),
                      ],
                    );
                  }).toList(),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  series.first.shortDate,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.grey.shade500 : Colors.grey.shade600,
                  ),
                ),
                Text(
                  series[series.length ~/ 2].shortDate,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.grey.shade500 : Colors.grey.shade600,
                  ),
                ),
                Text(
                  series.last.shortDate,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.grey.shade500 : Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLegendIndicator(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }

  Widget _buildOrdersByStateCard(AnalyticsData d, bool isDark) {
    final states = d.ordersByState;

    return AppCard(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.layers_rounded, color: AppTheme.primaryColor, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                'Orders by state',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          if (states.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text(
                  'No order has been placed yet.',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                  ),
                ),
              ),
            )
          else
            ...states.map((item) {
              final iconData = _stateIcon(item.state);
              final stateColor = _stateColor(item.state);

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                  color: isDark ? Colors.white.withValues(alpha: 0.02) : Colors.grey.shade50,
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: stateColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(iconData, color: stateColor, size: 16),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        item.state.toUpperCase(),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                        ),
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${item.count}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                          ),
                        ),
                        Text(
                          '৳${item.revenue.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.success,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),

          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.only(top: 10),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  width: 0.8,
                ),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Booked in $_selectedDays days: ৳${d.windowRevenue.toStringAsFixed(0)}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.grey.shade400 : Colors.grey.shade700,
                  ),
                ),
                InkWell(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const OrdersScreen()),
                    );
                  },
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Open orders',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                      SizedBox(width: 2),
                      Icon(Icons.arrow_forward_rounded, color: AppTheme.primaryColor, size: 14),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _stateIcon(String state) {
    switch (state.toLowerCase()) {
      case 'pending':
        return Icons.hourglass_top_rounded;
      case 'confirmed':
        return Icons.check_circle_outline_rounded;
      case 'processing':
        return Icons.sync_rounded;
      case 'shipped':
        return Icons.local_shipping_outlined;
      case 'delivered':
      case 'completed':
        return Icons.verified_outlined;
      case 'cancelled':
        return Icons.cancel_outlined;
      default:
        return Icons.shopping_bag_outlined;
    }
  }

  Color _stateColor(String state) {
    switch (state.toLowerCase()) {
      case 'pending':
        return AppTheme.warning;
      case 'confirmed':
        return AppTheme.info;
      case 'processing':
        return AppTheme.primaryColor;
      case 'shipped':
        return AppTheme.accentPurple;
      case 'delivered':
      case 'completed':
        return AppTheme.success;
      case 'cancelled':
        return AppTheme.danger;
      default:
        return AppTheme.primaryColor;
    }
  }

  Widget _buildTokenIntelligenceCard(TokenAnalyticsTotals t, bool isDark) {
    return AppCard(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.purple.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.smart_toy_outlined, color: Colors.purple, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                'AI Sales Agent Intelligence',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildTokenStatItem(
                  'Total LLM Runs',
                  '${t.totalRuns}',
                  isDark,
                ),
              ),
              Expanded(
                child: _buildTokenStatItem(
                  'Cache Hit Rate',
                  '${t.cacheHitPercent.toStringAsFixed(1)}%',
                  isDark,
                ),
              ),
              Expanded(
                child: _buildTokenStatItem(
                  'Avg Tokens/Reply',
                  '${t.avgTokensPerMessage}',
                  isDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Processed ${t.totalTokens.toString().replaceAllMapped(RegExp(r"(\d{1,3})(?=(\d{3})+(?!\d))"), (m) => "${m[1]},")} tokens. Gemini Context Caching active for high-speed sub-second customer replies.',
            style: TextStyle(
              fontSize: 11,
              color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTokenStatItem(String label, String value, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.bold,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildLifetimeStatsCard(LifetimeTotals totals, bool isDark) {
    return AppCard(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.history_rounded, color: AppTheme.primaryColor, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                'Since the store opened',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final itemWidth = (constraints.maxWidth - 24) / 3;
              return Wrap(
                spacing: 12,
                runSpacing: 14,
                children: [
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem('Products', '${totals.products}', isDark),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem('Channels', '${totals.channels}', isDark),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem('Conversations', '${totals.conversations}', isDark),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem('Messages', '${totals.messages}', isDark),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem('Orders', '${totals.orders}', isDark),
                  ),
                  SizedBox(
                    width: itemWidth,
                    child: _buildLifetimeItem(
                      'Revenue',
                      '৳${totals.revenue.toStringAsFixed(0)}',
                      isDark,
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.grey.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.speed_rounded, color: AppTheme.primaryColor, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? Colors.grey.shade400 : Colors.grey.shade700,
                        height: 1.4,
                      ),
                      children: [
                        const TextSpan(text: 'Your assistant answers at an average of '),
                        TextSpan(
                          text: '${totals.avgResponseTime.toStringAsFixed(1)}s ',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                        ),
                        const TextSpan(
                          text: 'after a customer writes in — measured over the whole store life.',
                        ),
                      ],
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

  Widget _buildLifetimeItem(String label, String value, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
          ),
        ),
      ],
    );
  }
}
