import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Detail view for one official ticket: status/priority/notes, operator notes and
/// the ticket's event history. The web page reaches this from the ticket list.
class OfficialTicketDetailSheet extends StatefulWidget {
  final String ticketId;
  final VoidCallback onChanged;

  const OfficialTicketDetailSheet({
    super.key,
    required this.ticketId,
    required this.onChanged,
  });

  @override
  State<OfficialTicketDetailSheet> createState() => _OfficialTicketDetailSheetState();
}

class _OfficialTicketDetailSheetState extends State<OfficialTicketDetailSheet> {
  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic>? _ticket;
  List<Map<String, dynamic>> _events = [];
  late String _status;
  late String _priority;
  final _notesController = TextEditingController();
  final _noteController = TextEditingController();

  static const _statuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
  static const _priorities = ['low', 'normal', 'high', 'urgent'];

  @override
  void initState() {
    super.initState();
    _status = 'open';
    _priority = 'normal';
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _notesController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final detail = await context.read<AdminProvider>().fetchOfficialTicketDetail(widget.ticketId);
    if (!mounted) return;
    if (detail != null) {
      final ticket = detail['ticket'] is Map
          ? Map<String, dynamic>.from(detail['ticket'] as Map)
          : <String, dynamic>{};
      _ticket = ticket;
      _status = (ticket['status'] ?? 'open').toString();
      _priority = (ticket['priority'] ?? 'normal').toString();
      _notesController.text = (ticket['notes'] ?? '').toString();
      _events = (detail['events'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    }
    setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await context.read<AdminProvider>().updateOfficialTicket(
            widget.ticketId,
            status: _status,
            priority: _priority,
            notes: _notesController.text.trim(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ticket saved'), backgroundColor: Color(0xFF10B981)),
      );
      widget.onChanged();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _addNote() async {
    final note = _noteController.text.trim();
    if (note.isEmpty) return;
    try {
      await context.read<AdminProvider>().addOfficialTicketNote(widget.ticketId, note);
      if (!mounted) return;
      _noteController.clear();
      widget.onChanged();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to add note: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ticket = _ticket ?? <String, dynamic>{};

    return Container(
      height: MediaQuery.of(context).size.height * 0.88,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF191A29) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (ticket['subject'] ?? 'Ticket').toString(),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${ticket['type'] ?? ''} · ${ticket['customerName'] ?? ticket['customerPlatformId'] ?? ''}',
                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (ticket['summary'] != null)
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(ticket['summary'].toString(), style: const TextStyle(fontSize: 13)),
                            ),
                          ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                value: _status,
                                decoration: const InputDecoration(
                                    labelText: 'Status', border: OutlineInputBorder(), isDense: true),
                                items: _statuses
                                    .map((s) => DropdownMenuItem(value: s, child: Text(s.replaceAll('_', ' '))))
                                    .toList(),
                                onChanged: (v) => setState(() => _status = v ?? 'open'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                value: _priority,
                                decoration: const InputDecoration(
                                    labelText: 'Priority', border: OutlineInputBorder(), isDense: true),
                                items: _priorities
                                    .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                                    .toList(),
                                onChanged: (v) => setState(() => _priority = v ?? 'normal'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _notesController,
                          maxLines: 4,
                          maxLength: 8000,
                          decoration: const InputDecoration(
                            labelText: 'Operator note',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _saving ? null : _save,
                            child: Text(_saving ? 'Saving…' : 'Save ticket'),
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text('Add a note', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _noteController,
                          maxLines: 3,
                          maxLength: 4000,
                          decoration: const InputDecoration(
                            hintText: 'What happened, what was done…',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(onPressed: _addNote, child: const Text('Add note')),
                        ),
                        const Divider(height: 20),
                        const Text('History', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        if (_events.isEmpty)
                          const Text('No events recorded.', style: TextStyle(fontSize: 12, color: Colors.grey))
                        else
                          ..._events.map((e) => ListTile(
                                dense: true,
                                title: Text((e['kind'] ?? 'event').toString(),
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                subtitle: Text(
                                  '${e['createdAt'] ?? ''} ${e['data'] ?? ''}',
                                  style: const TextStyle(fontSize: 10),
                                  maxLines: 2,
                                ),
                              )),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
