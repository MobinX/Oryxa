import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../config/app_theme.dart';

class AdminLogsScreen extends StatefulWidget {
  const AdminLogsScreen({super.key});

  @override
  State<AdminLogsScreen> createState() => _AdminLogsScreenState();
}

class _AdminLogsScreenState extends State<AdminLogsScreen> {
  final _dateFormat = DateFormat('yyyy-MM-dd HH:mm:ss');
  String _selectedLevel = 'all';

  // Sample platform audit events representing retained logs
  final List<Map<String, dynamic>> _mockEvents = [
    {
      'time': DateTime.now().subtract(const Duration(minutes: 4)),
      'level': 'info',
      'evt': 'auth_session_created',
      'message': 'Console session issued for operator account',
    },
    {
      'time': DateTime.now().subtract(const Duration(minutes: 18)),
      'level': 'info',
      'evt': 'webhook_received',
      'message': 'Facebook messenger webhook dispatched to agent runner',
    },
    {
      'time': DateTime.now().subtract(const Duration(minutes: 35)),
      'level': 'info',
      'evt': 'order_created',
      'message': 'Auto-pilot checkout created order #ORD-9821',
    },
    {
      'time': DateTime.now().subtract(const Duration(hours: 1, minutes: 12)),
      'level': 'warn',
      'evt': 'rate_limit_approaching',
      'message': 'Meta Graph API call quota reached 82% threshold',
    },
    {
      'time': DateTime.now().subtract(const Duration(hours: 2, minutes: 5)),
      'level': 'info',
      'evt': 'mail_dispatched',
      'message': 'Admin outbound email sent through MailWorker',
    },
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final filtered = _selectedLevel == 'all'
        ? _mockEvents
        : _mockEvents.where((e) => e['level'] == _selectedLevel).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Icon(Icons.receipt_long_outlined, color: AppTheme.primaryColor),
            const SizedBox(width: 8),
            Text(
              'System Event Log',
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
          'Live audit stream, security events, and asynchronous job executions.',
          style: TextStyle(
            fontSize: 13,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 16),
        // Filter Chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              ChoiceChip(
                label: const Text('All Events'),
                selected: _selectedLevel == 'all',
                onSelected: (_) => setState(() => _selectedLevel = 'all'),
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('Info'),
                selected: _selectedLevel == 'info',
                onSelected: (_) => setState(() => _selectedLevel = 'info'),
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('Warnings'),
                selected: _selectedLevel == 'warn',
                onSelected: (_) => setState(() => _selectedLevel = 'warn'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ...filtered.map((item) {
          final isWarn = item['level'] == 'warn';
          final isError = item['level'] == 'error';

          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
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
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: (isError
                                  ? AppTheme.danger
                                  : isWarn
                                      ? Colors.amber
                                      : Colors.blue)
                              .withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          (item['evt'] ?? 'EVENT').toString().toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: isError
                                ? AppTheme.danger
                                : isWarn
                                    ? Colors.amber.shade800
                                    : Colors.blue,
                          ),
                        ),
                      ),
                      Text(
                        _dateFormat.format(item['time'] as DateTime),
                        style: const TextStyle(fontSize: 11, color: Colors.grey, fontFamily: 'monospace'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    item['message'] as String,
                    style: const TextStyle(fontSize: 13),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
