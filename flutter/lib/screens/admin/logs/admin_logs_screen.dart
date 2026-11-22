import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Operator event log. Every row comes from `/api2/logs`; the mock feed this screen
/// once showed is gone. The browser page this mirrors stores filters in the URL and
/// reads naive `datetime-local` values as UTC, which is what we do here too.
class AdminLogsScreen extends StatefulWidget {
  const AdminLogsScreen({super.key});

  @override
  State<AdminLogsScreen> createState() => _AdminLogsScreenState();
}

class _AdminLogsScreenState extends State<AdminLogsScreen> {
  static const List<int> _limits = [25, 50, 100, 200];
  static const List<int> _hours = [1, 6, 24, 72, 168];

  String? _type;
  String? _start;
  String? _end;
  String? _cursor;
  int _limit = 50;

  List<Map<String, dynamic>> _types = [];
  Map<String, dynamic>? _storage;
  Map<String, dynamic>? _page;
  String? _error;
  bool _loading = false;
  final Set<int> _expanded = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMeta();
      _loadEvents();
    });
  }

  Future<void> _loadMeta() async {
    final admin = context.read<AdminProvider>();
    final types = await admin.fetchLogTypes();
    final storage = await admin.fetchLogStorage();
    if (mounted) setState(() {
      _types = types;
      _storage = storage;
    });
  }

  Future<void> _loadEvents() async {
    setState(() {
      _loading = true;
      _error = null;
      _expanded.clear();
    });
    try {
      final page = await context.read<AdminProvider>().fetchLogEvents(
            type: _type,
            start: _start,
            end: _end,
            cursor: _cursor,
            limit: _limit,
          );
      if (mounted) setState(() => _page = page);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst(RegExp(r'^ApiException: '), ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyQuickRange(int hours) {
    setState(() {
      _start = naiveUtc(DateTime.now().toUtc().subtract(Duration(hours: hours)));
      _end = null;
      _cursor = null;
    });
    _loadEvents();
  }

  void _reset() {
    setState(() {
      _type = null;
      _start = null;
      _end = null;
      _cursor = null;
      _limit = 50;
    });
    _loadEvents();
  }

  static String naiveUtc(DateTime dt) =>
      DateFormat("yyyy-MM-dd'T'HH:mm:ss").format(dt.toUtc());

  static String displayTime(String? value) {
    if (value == null || value.isEmpty) return '—';
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return value;
    return DateFormat('yyyy-MM-dd HH:mm:ss').format(parsed.toUtc()) + ' UTC';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final events = (_page?['events'] as List?) ?? const [];
    final window = _page?['window'] is Map
        ? Map<String, dynamic>.from(_page!['window'] as Map)
        : <String, dynamic>{};
    final source = (_page?['source'] ?? '').toString();
    final nextCursor = _page?['nextCursor']?.toString();

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadMeta(), _loadEvents()]);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.article_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Event log',
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
            'One row per fact the API recorded: requests, webhooks, agent runs, tool calls, database outcomes and the invariants they broke.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 16),

          if (_storage != null) _buildStoragePanel(isDark),
          if (_storage != null) const SizedBox(height: 16),

          // Filters
          Card(
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
                  DropdownButtonFormField<String>(
                    value: _type ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Type',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('All types')),
                      ..._types.map((t) => DropdownMenuItem(
                            value: t['evt']?.toString(),
                            child: Text('${t['label'] ?? t['evt']} (${t['evt']})',
                                overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: (v) {
                      setState(() => _type = (v == null || v.isEmpty) ? null : v);
                      _loadEvents();
                    },
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: TextEditingController(text: _start ?? ''),
                          decoration: const InputDecoration(
                            labelText: 'From (UTC)',
                            hintText: 'yyyy-MM-ddTHH:mm:ss',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          onSubmitted: (v) {
                            setState(() {
                              _start = v.trim().isEmpty ? null : v.trim();
                              _cursor = null;
                            });
                            _loadEvents();
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: TextEditingController(text: _end ?? ''),
                          decoration: const InputDecoration(
                            labelText: 'To (UTC)',
                            hintText: 'yyyy-MM-ddTHH:mm:ss',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          onSubmitted: (v) {
                            setState(() {
                              _end = v.trim().isEmpty ? null : v.trim();
                              _cursor = null;
                            });
                            _loadEvents();
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    value: _limit,
                    decoration: const InputDecoration(
                      labelText: 'Page size',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: _limits
                        .map((l) => DropdownMenuItem(value: l, child: Text('$l events')))
                        .toList(),
                    onChanged: (v) {
                      if (v == null) return;
                      setState(() => _limit = v);
                      _loadEvents();
                    },
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      ElevatedButton.icon(
                        onPressed: _loadEvents,
                        icon: const Icon(Icons.search, size: 16),
                        label: const Text('Apply'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                        ),
                      ),
                      ..._hours.map((h) => OutlinedButton(
                            onPressed: () => _applyQuickRange(h),
                            child: Text(h >= 24 ? 'last ${h ~/ 24}d' : 'last ${h}h',
                                style: const TextStyle(fontSize: 11)),
                          )),
                      TextButton(onPressed: _reset, child: const Text('reset')),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (_error != null)
            Card(
              color: AppTheme.dangerBg,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text('The query did not answer: $_error',
                    style: const TextStyle(color: AppTheme.danger)),
              ),
            ),

          if (_loading && _page == null)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),

          if (_page != null) ...[
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Text(
                      '${events.length} event${events.length == 1 ? '' : 's'} · newest first · page size ${_page!['limit'] ?? _limit} · open a row for its fields\n'
                      '${displayTime(window['startTime'])} → ${displayTime(window['endTime'])} · store: $source'
                      '${source == 'memory' ? ' (this process only, not history)' : ''}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  if (events.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: Text('Nothing recorded in this window.')),
                    )
                  else
                    ...events.asMap().entries.map((entry) {
                      final index = entry.key;
                      final raw = entry.value;
                      final event = raw is Map
                          ? Map<String, dynamic>.from(raw)
                          : <String, dynamic>{};
                      return _buildEventTile(event, index, isDark);
                    }),
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        nextCursor == null
                            ? Text('no older page in this window',
                                style: TextStyle(
                                    fontSize: 11,
                                    color: isDark
                                        ? AppTheme.textDarkSecondary
                                        : AppTheme.textLightSecondary))
                            : OutlinedButton(
                                onPressed: () {
                                  setState(() => _cursor = nextCursor);
                                  _loadEvents();
                                },
                                child: const Text('Older events'),
                              ),
                        _cursor == null
                            ? const SizedBox.shrink()
                            : TextButton(
                                onPressed: () {
                                  setState(() => _cursor = null);
                                  _loadEvents();
                                },
                                child: const Text('Back to newest'),
                              ),
                      ],
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

  Widget _buildEventTile(Map<String, dynamic> event, int index, bool isDark) {
    final evt = (event['evt'] ?? 'event').toString();
    final time = displayTime(event['time']?.toString());
    final fields = event['fields'] is Map
        ? Map<String, dynamic>.from(event['fields'] as Map)
        : <String, dynamic>{};
    final message = fields['message']?.toString() ??
        fields['msg']?.toString() ??
        fields['error']?.toString() ??
        jsonEncode(fields);
    final expanded = _expanded.contains(index);
    final isError = evt.toLowerCase().contains('error');

    return ExpansionTile(
      key: ValueKey('$time-$evt-$index'),
      initiallyExpanded: expanded,
      onExpansionChanged: (open) => setState(() {
        if (open) {
          _expanded.add(index);
        } else {
          _expanded.remove(index);
        }
      }),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: (isError ? AppTheme.danger : AppTheme.primaryColor).withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              evt.toUpperCase(),
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: isError ? AppTheme.danger : AppTheme.primaryColor,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              maxLines: expanded ? null : 1,
              overflow: expanded ? TextOverflow.visible : TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(time, style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.grey)),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              const JsonEncoder.withIndent('  ').convert(fields),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStoragePanel(bool isDark) {
    final storage = _storage!;
    final available = storage['available'] == true;
    final usedGb = storage['usedGb'];
    final remainingGb = storage['remainingGb'];
    final limitGb = storage['limitGb'];
    final percent = (storage['percentUsed'] as num?)?.toDouble() ?? 0;
    final source = (storage['source'] ?? '').toString();
    final dataset = storage['logDataset'] is Map
        ? Map<String, dynamic>.from(storage['logDataset'] as Map)
        : <String, dynamic>{};
    final retention = dataset['retentionKnown'] == true
        ? (dataset['retentionEnabled'] == true
            ? '${dataset['retentionDays'] ?? '?'} days'
            : 'No expiry')
        : 'Unknown';
    final note = storage['note']?.toString();

    String gb(dynamic value) => value == null ? '—' : '${(value as num).toStringAsFixed(3)} GB';

    return Card(
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
                Icon(Icons.storage,
                    size: 18, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                const SizedBox(width: 8),
                const Text('Axiom storage', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: (available ? Colors.green : Colors.grey).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(available ? 'axiom' : 'unavailable', style: const TextStyle(fontSize: 10)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              source == 'axiom'
                  ? 'Usage from Axiom\'s daily calculation${storage['measuredAt'] != null ? ', last measured ${displayTime(storage['measuredAt'].toString())}' : ''}. The allowance is the ${storage['limitConfigured'] == true ? 'configured' : 'always-free'} ${limitGb ?? '?'} GB.'
                  : 'Logs are held by this API process, so Axiom storage does not apply.',
              style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _storageStat('Stored', gb(usedGb))),
                const SizedBox(width: 8),
                Expanded(child: _storageStat('Left', gb(remainingGb))),
                const SizedBox(width: 8),
                Expanded(child: _storageStat('Retention', retention)),
              ],
            ),
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: (percent / 100).clamp(0.0, 1.0).toDouble(),
            ),
            if (note != null && note.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(note, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _storageStat(String label, String value) {
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
          const SizedBox(height: 3),
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
