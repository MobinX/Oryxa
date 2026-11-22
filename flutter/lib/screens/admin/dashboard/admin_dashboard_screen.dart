import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../models/admin_stats.dart';
import '../../../providers/admin_provider.dart';
import '../../../utils/admin_format.dart';

/// Parity with `apps/web/app/admin/page.tsx`: 8 KPIs with deltas, lifetime snapshot,
/// per-day chart, busiest businesses, health and the latest 8 log events.
class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  String _seriesKey = 'visits';
  List<Map<String, dynamic>> _recent = [];
  bool _logStoreAnswered = false;

  static const List<(String, String)> _series = [
    ('visits', 'Visits'),
    ('messages', 'Messages'),
    ('conversations', 'Conversations'),
    ('orders', 'Orders'),
    ('revenue', 'Revenue'),
    ('tokens', 'LLM tokens'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AdminProvider>().fetchAdminStats();
      _loadRecent();
    });
  }

  Future<void> _loadRecent() async {
    try {
      final page = await context.read<AdminProvider>().fetchLogEvents(limit: 8);
      if (!mounted) return;
      setState(() {
        _logStoreAnswered = page != null;
        _recent = (page?['events'] as List? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      });
    } catch (_) {
      if (mounted) setState(() => _logStoreAnswered = false);
    }
  }

  Future<void> _reload() async {
    await Future.wait([
      context.read<AdminProvider>().fetchAdminStats(days: context.read<AdminProvider>().statsDays),
      _loadRecent(),
    ]);
  }

  double _value(AdminDailyPoint p, String key) {
    switch (key) {
      case 'messages':
        return (p.messagesIn + p.messagesOut).toDouble();
      case 'conversations':
        return p.conversations.toDouble();
      case 'orders':
        return p.orders.toDouble();
      case 'revenue':
        return p.revenue;
      case 'tokens':
        return p.tokens.toDouble();
      default:
        return p.visits.toDouble();
    }
  }

  String _show(String key, num value) {
    switch (key) {
      case 'revenue':
        return AdminFormat.money(value);
      case 'tokens':
        return AdminFormat.compact(value);
      default:
        return AdminFormat.whole(value);
    }
  }

  Future<void> _downloadCsv() async {
    try {
      final csv = await context.read<AdminProvider>().fetchAdminCsv();
      await Clipboard.setData(ClipboardData(text: csv));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('CSV copied to clipboard (${csv.length} characters)')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('CSV export failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final admin = context.watch<AdminProvider>();
    final stats = admin.stats;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Platform',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Every business on one clock: who is here, what the agent is doing and what it costs.',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                    ),
                  ),
                ],
              ),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: _downloadCsv,
                    icon: const Icon(Icons.download, size: 16),
                    label: const Text('Download CSV'),
                  ),
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 7, label: Text('7d')),
                      ButtonSegment(value: 30, label: Text('30d')),
                      ButtonSegment(value: 90, label: Text('90d')),
                    ],
                    selected: {admin.statsDays},
                    onSelectionChanged: (set) =>
                        context.read<AdminProvider>().fetchAdminStats(days: set.first),
                    style: ButtonStyle(
                      visualDensity: VisualDensity.compact,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: _reload,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Reload'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (admin.statsError != null)
            Card(
              color: AppTheme.dangerBg,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('The numbers did not load',
                        style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.danger)),
                    const SizedBox(height: 4),
                    Text(admin.statsError!, style: const TextStyle(fontSize: 12)),
                    const SizedBox(height: 4),
                    const Text(
                      'This page reads /api2/admin/stats. The console key and the visits table are both required.',
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ),

          if (admin.isStatsLoading && stats == null)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),

          if (stats == null && admin.statsError == null && !admin.isStatsLoading)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('No platform analytics data available.')),
              ),
            ),

          if (stats != null) ...[
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.4,
              children: [
                _kpi('Conversations', AdminFormat.whole(stats.window.conversations),
                    stats.window.conversations, stats.previous.conversations, Icons.forum_outlined, isDark),
                _kpi('Messages', AdminFormat.whole(stats.window.messages), stats.window.messages,
                    stats.previous.messages, Icons.chat_bubble_outline, isDark,
                    sub: '${AdminFormat.whole(stats.window.inboundMessages)} in · '
                        '${AdminFormat.whole(stats.window.outboundMessages)} out'),
                _kpi('Orders', AdminFormat.whole(stats.window.orders), stats.window.orders,
                    stats.previous.orders, Icons.shopping_bag_outlined, isDark),
                _kpi('Revenue', AdminFormat.money(stats.window.revenue), stats.window.revenue,
                    stats.previous.revenue, Icons.attach_money, isDark),
                _kpi('Storefront visits', AdminFormat.whole(stats.window.visits), stats.window.visits,
                    stats.previous.visits, Icons.visibility_outlined, isDark,
                    sub: stats.window.visits == 0
                        ? 'tracking starts with this deploy'
                        : 'one per person, per store, per day'),
                _kpi('Agent runs', AdminFormat.whole(stats.window.agentRuns), stats.window.agentRuns,
                    stats.previous.agentRuns, Icons.smart_toy_outlined, isDark),
                _kpi('LLM tokens', AdminFormat.compact(stats.window.llmTokens), stats.window.llmTokens,
                    stats.previous.llmTokens, Icons.memory_outlined, isDark, neutral: true),
                _kpi('Estimated cost', AdminFormat.tokenMoney(stats.window.estimatedCostUsd),
                    stats.window.estimatedCostUsd, stats.previous.estimatedCostUsd,
                    Icons.receipt_outlined, isDark,
                    sub: 'from the hourly rollup, so a floor', neutral: true),
              ],
            ),
            const SizedBox(height: 20),

            _card(
              isDark,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('EVERY ACCOUNT, ALL TIME',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
                      TextButton(
                        onPressed: () => _showRecentEvents(isDark),
                        child: const Text('Event log →', style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 16,
                    runSpacing: 12,
                    children: [
                      _snapshot('Users', stats.snapshot.users),
                      _snapshot('Businesses', stats.snapshot.businesses),
                      _snapshot('Published stores', stats.snapshot.publishedStores),
                      _snapshot('Channels', stats.snapshot.channels),
                      _snapshot('Products', stats.snapshot.products),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            _card(
              isDark,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Per day, on your clock',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                      Text('${stats.days} days · ${stats.tz}',
                          style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'A day is yours, not the server\'s: ${stats.startTime} starts the window.',
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    children: _series.map((s) {
                      final selected = s.$1 == _seriesKey;
                      return ChoiceChip(
                        label: Text(s.$2, style: const TextStyle(fontSize: 11)),
                        selected: selected,
                        onSelected: (_) => setState(() => _seriesKey = s.$1),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                  _buildChart(stats.daily, isDark),
                ],
              ),
            ),
            const SizedBox(height: 20),

            Text('Busiest businesses (${stats.days}d)',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary)),
            const SizedBox(height: 8),
            if (stats.topBusinesses.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('A quiet window — no business had activity in this period.'),
                ),
              )
            else
              ...stats.topBusinesses.take(20).map((b) => _businessRow(b, isDark)),
            const SizedBox(height: 20),

            _card(
              isDark,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Health', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 3),
                  const Text('Counted from the log store, not from Postgres.',
                      style: TextStyle(fontSize: 11, color: Colors.grey)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _healthTile(
                          'Errors',
                          stats.anomalies,
                          stats.anomalies?.errors,
                          isDark,
                          AppTheme.danger,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _healthTile(
                          'Auth rejections',
                          stats.anomalies,
                          stats.anomalies?.authRejections,
                          isDark,
                          Colors.amber,
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 20),
                  const Text('LATEST EVENTS',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
                  const SizedBox(height: 8),
                  if (!_logStoreAnswered)
                    const Text('The log store did not answer. The numbers above are unaffected.',
                        style: TextStyle(fontSize: 12, color: Colors.grey))
                  else if (_recent.isEmpty)
                    const Text('Nothing in the log store yet.',
                        style: TextStyle(fontSize: 12, color: Colors.grey))
                  else
                    ..._recent.map((e) => _eventLine(e, isDark)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Window ${stats.startTime} → ${stats.endTime} · ${stats.tz}. Comparisons are against the ${stats.days} days before that.',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ],
      ),
    );
  }

  Widget _kpi(String label, String value, num current, num previous, IconData icon, bool isDark,
      {String? sub, bool neutral = false}) {
    final delta = AdminFormat.deltaOf(current, previous);
    Color? tone;
    if (delta != null) {
      if (neutral || delta.tone == 'flat') {
        tone = Colors.grey;
      } else if (delta.tone == 'up') {
        tone = const Color(0xFF10B981);
      } else {
        tone = AppTheme.danger;
      }
    }
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
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(label.toUpperCase(),
                      style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey)),
                ),
                Icon(icon, size: 15, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
              ],
            ),
            Text(value,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                )),
            Row(
              children: [
                if (delta != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: (tone ?? Colors.grey).withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(delta.text,
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: tone)),
                  ),
                if (sub != null && sub.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 9, color: Colors.grey)),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _snapshot(String label, int count) {
    return SizedBox(
      width: 110,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey)),
          const SizedBox(height: 2),
          Text(AdminFormat.whole(count), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildChart(List<AdminDailyPoint> daily, bool isDark) {
    if (daily.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Center(child: Text('No daily points in this window.')),
      );
    }
    final values = daily.map((p) => _value(p, _seriesKey)).toList();
    final max = values.reduce((a, b) => a > b ? a : b);
    final total = values.fold<double>(0, (sum, v) => sum + v);
    final peak = values.indexOf(max);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          max > 0
              ? 'total ${_show(_seriesKey, total)} · peak ${_show(_seriesKey, max)} on ${daily[peak].date}'
              : 'nothing on this metric yet',
          style: const TextStyle(fontSize: 11, color: Colors.grey),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 180,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: daily.length,
            itemBuilder: (context, index) {
              final point = daily[index];
              final value = values[index];
              final height = max > 0 && value > 0
                  ? (value / max * 150).clamp(3.0, 150.0).toDouble()
                  : 0.0;
              return GestureDetector(
                onTap: () => _showDay(point, isDark),
                child: Container(
                  width: daily.length > 40 ? 14 : 24,
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Container(
                        height: height,
                        decoration: BoxDecoration(
                          color: AppTheme.primaryColor.withValues(alpha: value > 0 ? 0.75 : 0),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        index == peak ? point.date.substring(5) : '',
                        style: const TextStyle(fontSize: 8, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  void _showDay(AdminDailyPoint p, bool isDark) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(p.date),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: _series.map((s) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(s.$2, style: const TextStyle(fontSize: 12)),
                    Text(_show(s.$1, _value(p, s.$1)),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
              )).toList(),
        ),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close'))],
      ),
    );
  }

  Widget _businessRow(AdminTopBusiness b, bool isDark) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: ListTile(
        dense: true,
        leading: CircleAvatar(
          backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
          child: Text((b.name.isNotEmpty ? b.name[0] : '?').toUpperCase(),
              style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold)),
        ),
        title: Text(b.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        subtitle: Text(
          '${b.slug ?? 'no store published'} · ${AdminFormat.whole(b.conversations)} chats · '
          '${AdminFormat.whole(b.messages)} messages · ${AdminFormat.whole(b.orders)} orders',
          style: const TextStyle(fontSize: 10),
        ),
        trailing: Text(AdminFormat.money(b.revenue),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.primaryColor)),
      ),
    );
  }

  Widget _healthTile(String label, AdminAnomalies? anomalies, int? count, bool isDark, Color tone) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(
            anomalies == null
                ? 'log store unavailable'
                : (anomalies.cap > 0 && count != null && count >= anomalies.cap
                    ? '${anomalies.cap}+'
                    : AdminFormat.whole(count ?? 0)),
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: anomalies != null && count != null && count > 0 ? tone : null,
            ),
          ),
        ],
      ),
    );
  }

  Widget _eventLine(Map<String, dynamic> event, bool isDark) {
    final fields = event['fields'] is Map
        ? Map<String, dynamic>.from(event['fields'] as Map)
        : <String, dynamic>{};
    final message = fields['message']?.toString() ??
        fields['msg']?.toString() ??
        fields['error']?.toString() ??
        '';
    final time = DateTime.tryParse(event['time']?.toString() ?? '');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('[${event['evt'] ?? 'event'}]',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(message,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11)),
          ),
          const SizedBox(width: 6),
          Text(time == null ? '' : DateFormat('HH:mm').format(time.toUtc()),
              style: const TextStyle(fontSize: 9, color: Colors.grey)),
        ],
      ),
    );
  }

  void _showRecentEvents(bool isDark) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: const Text('Latest events')),
        body: _recent.isEmpty
            ? const Center(child: Text('No events recorded.'))
            : ListView.builder(
                itemCount: _recent.length,
                itemBuilder: (context, i) => _eventLine(_recent[i], isDark),
              ),
      ),
    ));
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
