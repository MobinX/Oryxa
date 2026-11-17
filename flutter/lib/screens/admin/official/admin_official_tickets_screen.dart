import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../config/app_theme.dart';
import '../../../../providers/admin_provider.dart';

class AdminOfficialTicketsScreen extends StatefulWidget {
  const AdminOfficialTicketsScreen({super.key});

  @override
  State<AdminOfficialTicketsScreen> createState() => _AdminOfficialTicketsScreenState();
}

class _AdminOfficialTicketsScreenState extends State<AdminOfficialTicketsScreen> {
  bool _isLoading = true;
  String _statusFilter = 'all';
  List<Map<String, dynamic>> _tickets = [];

  static const Map<String, String> _statusLabels = {
    'all': 'All states',
    'open': 'Open',
    'in_progress': 'In progress',
    'waiting': 'Waiting',
    'resolved': 'Resolved',
    'closed': 'Closed',
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadTickets());
  }

  Future<void> _loadTickets() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();
    final rows = await admin.fetchOfficialTickets(
      status: _statusFilter == 'all' ? null : _statusFilter,
    );

    if (mounted) {
      setState(() {
        _tickets = rows;
        _isLoading = false;
      });
    }
  }

  Future<void> _showUpdateDialog(Map<String, dynamic> ticket) async {
    final ticketId = (ticket['id'] ?? '').toString();
    String currentStatus = (ticket['status'] ?? 'open').toString();
    String? currentPriority = ticket['priority']?.toString();
    final notesController = TextEditingController(text: (ticket['notes'] ?? '').toString());

    final updated = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Update Ticket'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Status', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  value: currentStatus,
                  isDense: true,
                  decoration: InputDecoration(
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'open', child: Text('Open')),
                    DropdownMenuItem(value: 'in_progress', child: Text('In progress')),
                    DropdownMenuItem(value: 'waiting', child: Text('Waiting')),
                    DropdownMenuItem(value: 'resolved', child: Text('Resolved')),
                    DropdownMenuItem(value: 'closed', child: Text('Closed')),
                  ],
                  onChanged: (val) {
                    if (val != null) setDialogState(() => currentStatus = val);
                  },
                ),
                const SizedBox(height: 12),
                const Text('Priority', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  value: currentPriority ?? 'normal',
                  isDense: true,
                  decoration: InputDecoration(
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'low', child: Text('Low')),
                    DropdownMenuItem(value: 'normal', child: Text('Normal')),
                    DropdownMenuItem(value: 'high', child: Text('High')),
                    DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
                  ],
                  onChanged: (val) {
                    if (val != null) setDialogState(() => currentPriority = val);
                  },
                ),
                const SizedBox(height: 12),
                const Text('Internal Notes', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                TextField(
                  controller: notesController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Add response note or resolution details...',
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
              child: const Text('Save', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );

    if (updated == true && mounted) {
      final admin = context.read<AdminProvider>();
      final ok = await admin.updateOfficialTicket(
        ticketId,
        status: currentStatus,
        priority: currentPriority,
        notes: notesController.text.trim(),
      );
      if (mounted) {
        if (ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Ticket updated'), backgroundColor: Color(0xFF10B981)),
          );
          _loadTickets();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to update ticket'), backgroundColor: AppTheme.danger),
          );
        }
      }
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'open':
        return Colors.blue;
      case 'in_progress':
        return Colors.amber;
      case 'waiting':
        return Colors.purple;
      case 'resolved':
        return const Color(0xFF10B981);
      case 'closed':
        return Colors.grey;
      default:
        return AppTheme.primaryColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return RefreshIndicator(
      onRefresh: _loadTickets,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.support_agent_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Support Tickets',
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
            'Support and security reports the official AI logged while talking to people. One open ticket per problem: the AI appends, you respond.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 12),

          // State filter pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _statusLabels.entries.map((entry) {
                final isSelected = _statusFilter == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(entry.value, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                    selected: isSelected,
                    selectedColor: AppTheme.primaryColor.withValues(alpha: 0.2),
                    onSelected: (val) {
                      if (val) {
                        setState(() => _statusFilter = entry.key);
                        _loadTickets();
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
          ] else if (_tickets.isEmpty) ...[
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
                    Icon(Icons.support_agent, size: 48, color: isDark ? Colors.white24 : Colors.black26),
                    const SizedBox(height: 12),
                    Text(
                      'No tickets in ${_statusLabels[_statusFilter]} right now',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'When the official AI logs a problem while talking to someone, it lands here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            ..._tickets.map((ticket) {
              final type = (ticket['type'] ?? 'support').toString();
              final status = (ticket['status'] ?? 'open').toString();
              final priority = (ticket['priority'] ?? 'normal').toString();
              final summary = (ticket['summary'] ?? ticket['subject'] ?? 'No summary provided').toString();
              final notes = (ticket['notes'] ?? '').toString();
              final createdAt = (ticket['createdAt'] ?? '').toString();

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
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              status.toUpperCase(),
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: _statusColor(status)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: (priority == 'urgent' ? AppTheme.danger : Colors.blue).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              priority.toUpperCase(),
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                                color: priority == 'urgent' ? AppTheme.danger : Colors.blue,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            type.toUpperCase(),
                            style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        summary,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      if (notes.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Note: $notes',
                            style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                          ),
                        ),
                      ],
                      const Divider(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            createdAt.isNotEmpty ? 'Logged: ${createdAt.split('T').first}' : '',
                            style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _showUpdateDialog(ticket),
                            icon: const Icon(Icons.edit, size: 13),
                            label: const Text('Update', style: TextStyle(fontSize: 11)),
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
