import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final _currencyFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 2);
  final _numberFormat = NumberFormat.compact();

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
      child: admin.isStatsLoading && stats == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header & Range Selector
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Platform Overview',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Aggregated network analytics',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                          ),
                        ),
                      ],
                    ),
                    // Range chips (7d, 30d, 90d)
                    SegmentedButton<int>(
                      segments: const [
                        ButtonSegment(value: 7, label: Text('7d')),
                        ButtonSegment(value: 30, label: Text('30d')),
                        ButtonSegment(value: 90, label: Text('90d')),
                      ],
                      selected: {admin.statsDays},
                      onSelectionChanged: (set) {
                        admin.fetchAdminStats(days: set.first);
                      },
                      style: ButtonStyle(
                        visualDensity: VisualDensity.compact,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                if (stats == null) ...[
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(
                        child: Text('No platform analytics data available.'),
                      ),
                    ),
                  ),
                ] else ...[
                  // Primary Metrics Grid
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.45,
                    children: [
                      _buildMetricCard(
                        title: 'Total Revenue',
                        value: _currencyFormat.format(stats.window.revenue),
                        subtitle: 'Last ${stats.days} days',
                        icon: Icons.attach_money,
                        color: const Color(0xFF10B981),
                        isDark: isDark,
                      ),
                      _buildMetricCard(
                        title: 'Total Orders',
                        value: _numberFormat.format(stats.window.orders),
                        subtitle: 'Completed checkouts',
                        icon: Icons.shopping_bag_outlined,
                        color: Colors.blue,
                        isDark: isDark,
                      ),
                      _buildMetricCard(
                        title: 'Conversations',
                        value: _numberFormat.format(stats.window.conversations),
                        subtitle: '${_numberFormat.format(stats.window.messages)} messages',
                        icon: Icons.chat_bubble_outline,
                        color: Colors.purple,
                        isDark: isDark,
                      ),
                      _buildMetricCard(
                        title: 'LLM Tokens',
                        value: _numberFormat.format(stats.window.llmTokens),
                        subtitle: 'Est. \$${stats.window.estimatedCostUsd.toStringAsFixed(2)}',
                        icon: Icons.memory_outlined,
                        color: Colors.amber,
                        isDark: isDark,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Lifetime Snapshot Card
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
                            children: [
                              const Icon(Icons.hub_outlined, size: 18, color: AppTheme.primaryColor),
                              const SizedBox(width: 8),
                              Text(
                                'Lifetime Platform Snapshot',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _buildSnapshotItem('Merchants', stats.snapshot.users),
                              _buildSnapshotItem('Stores', stats.snapshot.businesses),
                              _buildSnapshotItem('Live', stats.snapshot.publishedStores),
                              _buildSnapshotItem('Channels', stats.snapshot.channels),
                              _buildSnapshotItem('Products', stats.snapshot.products),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Top Stores / Busiest Merchants
                  Text(
                    'Busiest Stores (${stats.days}d)',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    ),
                  ),
                  const SizedBox(height: 10),

                  if (stats.topBusinesses.isEmpty) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'No merchant activity recorded in this period.',
                          style: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                          ),
                        ),
                      ),
                    ),
                  ] else ...[
                    ...stats.topBusinesses.take(8).map((store) {
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                        ),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                            child: Text(
                              (store.name.isNotEmpty ? store.name[0] : '?').toUpperCase(),
                              style: const TextStyle(
                                color: AppTheme.primaryColor,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          title: Text(
                            store.name,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                          ),
                          subtitle: Text(
                            '${store.conversations} convos · ${store.orders} orders',
                            style: const TextStyle(fontSize: 12),
                          ),
                          trailing: Text(
                            _currencyFormat.format(store.revenue),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: AppTheme.primaryColor,
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ],
              ],
            ),
    );
  }

  Widget _buildMetricCard({
    required String title,
    required String value,
    required String subtitle,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 16, color: color),
                ),
              ],
            ),
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
              ),
            ),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSnapshotItem(String label, int count) {
    return Column(
      children: [
        Text(
          _numberFormat.format(count),
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: Colors.grey,
          ),
        ),
      ],
    );
  }
}
