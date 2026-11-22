import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Parity with `apps/web/app/admin/plans/plans-table.tsx`: editable plan cards, a
/// new-plan card, and a business roster with custom caps, assignment and cycle reset.
class AdminPlansScreen extends StatefulWidget {
  const AdminPlansScreen({super.key});

  @override
  State<AdminPlansScreen> createState() => _AdminPlansScreenState();
}

class _AdminPlansScreenState extends State<AdminPlansScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _plans = [];
  List<Map<String, dynamic>> _businesses = [];
  String _search = '';
  bool _showAll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final admin = context.read<AdminProvider>();
    final results = await Future.wait([
      admin.fetchAdminPlans(),
      admin.fetchAdminBusinessPlans(),
    ]);
    if (mounted) {
      setState(() {
        _plans = results[0];
        _businesses = results[1];
        _loading = false;
      });
    }
  }

  void _notice(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), backgroundColor: error ? AppTheme.danger : const Color(0xFF10B981)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final unassigned = _businesses.where((b) => b['planId'] == null).toList();
    final visible = (_showAll ? _businesses : unassigned).where((b) {
      if (_search.isEmpty) return true;
      final q = _search.toLowerCase();
      return (b['businessName'] ?? '').toString().toLowerCase().contains(q);
    }).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.credit_card_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text('Plans',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                  )),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'What each plan allows, who is on it, and what happens to them the moment you change it.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 14),

          Card(
            elevation: 0,
            color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: Color(0xFFF59E0B), width: 1.2),
            ),
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, size: 18, color: Color(0xFFF59E0B)),
                      SizedBox(width: 8),
                      Text('Saving a plan is a fleet-wide action',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFFF59E0B))),
                    ],
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Limits are read from this table when the agent replies — never copied onto a store. '
                    'An empty limit means uncapped; 0 means no replies at all. A store can also carry a '
                    'custom cap, which wins over its plan (blank follows the plan, 0 freezes). '
                    'Deleting a plan is refused while any store sits on it — retire it instead.',
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else ...[
            Row(
              children: [
                const Text('Plans', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const SizedBox(width: 8),
                Text('${_plans.length} tiers · ${_plans.where((p) => p['active'] == true).length} active',
                    style: const TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
            const SizedBox(height: 8),
            if (_plans.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Center(child: Text('No plans yet. Add the first tier below.')),
                ),
              )
            else
              ..._plans.map((plan) => _PlanCard(
                    plan: plan,
                    onChanged: _load,
                    onNotice: _notice,
                  )),
            const SizedBox(height: 12),
            _NewPlanCard(onCreated: _load, onNotice: _notice),
            const SizedBox(height: 20),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Businesses', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                OutlinedButton(
                  onPressed: () => setState(() => _showAll = !_showAll),
                  child: Text(_showAll ? 'Show only unplanned' : 'Show all ${_businesses.length}',
                      style: const TextStyle(fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${unassigned.length} of ${_businesses.length} have no plan — those get unlimited replies until assigned one.',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
            const SizedBox(height: 10),
            TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search store name...',
                prefixIcon: const Icon(Icons.search, size: 18),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            if (visible.isEmpty)
              const Card(
                child: Padding(padding: EdgeInsets.all(20), child: Center(child: Text('No businesses to show.'))),
              )
            else
              ...visible.take(200).map((b) => _BusinessRow(
                    row: b,
                    plans: _plans,
                    onChanged: _load,
                    onNotice: _notice,
                  )),
            if ((_showAll ? _businesses.length : unassigned.length) > 200)
              const Padding(
                padding: EdgeInsets.all(10),
                child: Text('Showing the first 200 stores.', style: TextStyle(fontSize: 11, color: Colors.grey)),
              ),
          ],
        ],
      ),
    );
  }
}

String _limitLabel(dynamic value) {
  if (value == null) return 'Uncapped';
  if (value == 0) return 'Frozen (0)';
  return value.toString();
}

int? _parseLimit(String text) {
  final trimmed = text.trim().replaceAll(RegExp(r'[,\s]'), '');
  if (trimmed.isEmpty) return null;
  final value = int.tryParse(trimmed);
  if (value == null || value < 0) throw const FormatException('Use whole numbers of 0 or more, or leave blank.');
  return value;
}

Map<String, dynamic> _draftOf(Map<String, dynamic> plan) {
  return {
    'name': (plan['name'] ?? '').toString(),
    'slug': (plan['slug'] ?? '').toString(),
    'price': ((((plan['priceCents'] as num?)?.toInt() ?? 0) / 100)).toStringAsFixed(2),
    'currency': (plan['currency'] ?? 'USD').toString(),
    'messageLimit': plan['messageLimit'] == null ? '' : plan['messageLimit'].toString(),
    'commentLimit': plan['commentLimit'] == null ? '' : plan['commentLimit'].toString(),
    'features': (plan['features'] is List ? (plan['features'] as List).join('\n') : '').toString(),
    'position': (plan['position'] ?? 0).toString(),
    'active': plan['active'] != false,
  };
}

/// Sends the dollars/cents conversion and NULL-vs-0 split the web form uses.
Map<String, dynamic> _bodyFromDraft(Map<String, dynamic> draft) {
  final price = double.tryParse(draft['price'].toString()) ?? 0;
  return {
    'name': draft['name'].toString().trim(),
    'slug': draft['slug'].toString().trim(),
    'priceCents': (price * 100).round(),
    'currency': draft['currency'].toString().toUpperCase(),
    'messageLimit': _parseLimit(draft['messageLimit'].toString()),
    'commentLimit': _parseLimit(draft['commentLimit'].toString()),
    'features': draft['features']
        .toString()
        .split('\n')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList(),
    'position': int.tryParse(draft['position'].toString()) ?? 0,
    'active': draft['active'] == true,
  };
}

class _PlanCard extends StatefulWidget {
  final Map<String, dynamic> plan;
  final VoidCallback onChanged;
  final void Function(String, {bool error}) onNotice;

  const _PlanCard({required this.plan, required this.onChanged, required this.onNotice});

  @override
  State<_PlanCard> createState() => _PlanCardState();
}

class _PlanCardState extends State<_PlanCard> {
  late Map<String, dynamic> _draft;
  String? _message;
  bool _error = false;
  List<dynamic>? _conflict;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _draft = _draftOf(widget.plan);
  }

  @override
  void didUpdateWidget(covariant _PlanCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.plan != widget.plan) _draft = _draftOf(widget.plan);
  }

  bool get _dirty => _draft.toString() != _draftOf(widget.plan).toString();

  void _set(String key, dynamic value) => setState(() => _draft[key] = value);

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _message = null;
      _conflict = null;
    });
    try {
      final body = _bodyFromDraft(_draft);
      final notified = await context.read<AdminProvider>().updatePlan(widget.plan['id'].toString(), body);
      if (!mounted) return;
      setState(() {
        _message = notified > 0
            ? 'Saved. $notified businesses were pushed past a threshold and notified.'
            : 'Saved. Every business on this plan picked up the new caps immediately.';
        _error = false;
        _busy = false;
      });
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
        _error = true;
        _busy = false;
      });
    }
  }

  Future<void> _retire() async {
    setState(() => _busy = true);
    try {
      await context.read<AdminProvider>().retirePlan(widget.plan['id'].toString(), _bodyFromDraft(_draft));
      if (!mounted) return;
      setState(() {
        _draft['active'] = false;
        _message = 'Retired. No new store can be put on it; stores already on it are untouched.';
        _error = false;
        _busy = false;
      });
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.toString();
        _error = true;
        _busy = false;
      });
    }
  }

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _message = null;
      _conflict = null;
    });
    try {
      final conflict = await context.read<AdminProvider>().deletePlan(widget.plan['id'].toString());
      if (!mounted) return;
      if (conflict == null) {
        widget.onNotice('Plan deleted.');
        widget.onChanged();
      } else {
        setState(() {
          _conflict = conflict;
          _busy = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.toString();
        _error = true;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final count = (widget.plan['businessCount'] as num?)?.toInt() ?? 0;
    final msg = int.tryParse(_draft['messageLimit'].toString().trim().replaceAll(',', ''));
    final cmt = int.tryParse(_draft['commentLimit'].toString().trim().replaceAll(',', ''));
    final frozen = msg == 0 || cmt == 0;
    final lowered = (msg != null && widget.plan['messageLimit'] != null && msg < widget.plan['messageLimit']) ||
        (cmt != null && widget.plan['commentLimit'] != null && cmt < widget.plan['commentLimit']);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 6,
              children: [
                Chip(
                  label: Text('$count ${count == 1 ? 'business' : 'businesses'}',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                  visualDensity: VisualDensity.compact,
                ),
                Chip(
                  label: Text(_draft['active'] == true ? 'Active' : 'Retired',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: TextEditingController(text: _draft['name'].toString()),
              onChanged: (v) => _set('name', v),
              decoration: const InputDecoration(labelText: 'Plan name', border: OutlineInputBorder(), isDense: true),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: TextEditingController(text: _draft['slug'].toString()),
              onChanged: (v) => _set('slug', v),
              decoration: const InputDecoration(labelText: 'Slug', border: OutlineInputBorder(), isDense: true),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: const Text('Active', style: TextStyle(fontSize: 12)),
              value: _draft['active'] == true,
              onChanged: (v) => _set('active', v),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: TextEditingController(text: _draft['price'].toString()),
                    onChanged: (v) => _set('price', v),
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Price', border: OutlineInputBorder(), isDense: true),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: _draft['currency'].toString()),
                    onChanged: (v) => _set('currency', v.toUpperCase()),
                    maxLength: 3,
                    decoration: const InputDecoration(labelText: 'Currency', border: OutlineInputBorder(), isDense: true),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: _draft['position'].toString()),
                    onChanged: (v) => _set('position', v),
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Order', border: OutlineInputBorder(), isDense: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: _draft['messageLimit'].toString()),
                    onChanged: (v) => _set('messageLimit', v),
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Messages / cycle',
                      hintText: 'Uncapped',
                      border: const OutlineInputBorder(),
                      isDense: true,
                      helperText: 'now ${_limitLabel(widget.plan['messageLimit'])}',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: _draft['commentLimit'].toString()),
                    onChanged: (v) => _set('commentLimit', v),
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Comments / cycle',
                      hintText: 'Uncapped',
                      border: const OutlineInputBorder(),
                      isDense: true,
                      helperText: 'now ${_limitLabel(widget.plan['commentLimit'])}',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: TextEditingController(text: _draft['features'].toString()),
              onChanged: (v) => _set('features', v),
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Features (one per line)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            if (frozen && count > 0)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  'A limit of 0 stops every agent reply for $count ${count == 1 ? 'business' : 'businesses'} from their next inbound message.',
                  style: const TextStyle(fontSize: 11, color: AppTheme.danger, fontWeight: FontWeight.bold),
                ),
              ),
            if (!frozen && lowered && count > 0)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  'This lowers the cap for $count ${count == 1 ? 'business' : 'businesses'} — some may already be over it.',
                  style: const TextStyle(fontSize: 11, color: Color(0xFFF59E0B), fontWeight: FontWeight.bold),
                ),
              ),
            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_message!,
                    style: TextStyle(fontSize: 11, color: _error ? AppTheme.danger : const Color(0xFF10B981))),
              ),
            if (_conflict != null)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.dangerBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Businesses are still on this plan — retire it instead.',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.danger)),
                    ..._conflict!.take(5).map((b) => Text(
                          '• ${b is Map ? b['name'] : b}',
                          style: const TextStyle(fontSize: 11),
                        )),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _busy || !_dirty ? null : _save,
                  child: Text(_busy ? 'Saving…' : 'Save plan', style: const TextStyle(fontSize: 11)),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy || _draft['active'] == false ? null : _retire,
                  child: const Text('Retire', style: TextStyle(fontSize: 11)),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy ? null : _delete,
                  style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
                  child: const Text('Delete', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NewPlanCard extends StatefulWidget {
  final VoidCallback onCreated;
  final void Function(String, {bool error}) onNotice;

  const _NewPlanCard({required this.onCreated, required this.onNotice});

  @override
  State<_NewPlanCard> createState() => _NewPlanCardState();
}

class _NewPlanCardState extends State<_NewPlanCard> {
  bool _open = false;
  bool _busy = false;
  final Map<String, dynamic> _draft = {
    'name': '',
    'slug': '',
    'price': '0.00',
    'currency': 'USD',
    'messageLimit': '',
    'commentLimit': '',
    'features': '',
    'position': '0',
    'active': true,
  };

  @override
  Widget build(BuildContext context) {
    if (!_open) {
      return Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: ListTile(
          title: const Text('New plan', style: TextStyle(fontWeight: FontWeight.bold)),
          subtitle: const Text('Add a tier without touching the existing ones.', style: TextStyle(fontSize: 11)),
          trailing: ElevatedButton.icon(
            onPressed: () => setState(() => _open = true),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add a plan', style: TextStyle(fontSize: 11)),
          ),
        ),
      );
    }
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('New plan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                IconButton(onPressed: () => setState(() => _open = false), icon: const Icon(Icons.close, size: 18)),
              ],
            ),
            const SizedBox(height: 8),
            _field('Plan name', 'name'),
            const SizedBox(height: 8),
            _field('Slug', 'slug'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(flex: 2, child: _field('Price', 'price')),
                const SizedBox(width: 8),
                Expanded(child: _field('Currency', 'currency')),
                const SizedBox(width: 8),
                Expanded(child: _field('Order', 'position')),
              ],
            ),
            const SizedBox(height: 8),
            _field('Messages / cycle (blank = uncapped)', 'messageLimit'),
            const SizedBox(height: 8),
            _field('Comments / cycle (blank = uncapped)', 'commentLimit'),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) => _draft['features'] = v,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Features (one per line)', border: OutlineInputBorder(), isDense: true),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _busy || _draft['name'].toString().trim().isEmpty || _draft['slug'].toString().trim().isEmpty
                      ? null
                      : _create,
                  child: Text(_busy ? 'Creating…' : 'Create plan', style: const TextStyle(fontSize: 11)),
                ),
                const SizedBox(width: 8),
                TextButton(onPressed: () => setState(() => _open = false), child: const Text('Cancel')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(String label, String key) {
    return TextField(
      controller: TextEditingController(text: _draft[key].toString()),
      onChanged: (v) => _draft[key] = v,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
    );
  }

  Future<void> _create() async {
    setState(() => _busy = true);
    try {
      await context.read<AdminProvider>().createPlan(_bodyFromDraft(_draft));
      widget.onNotice('Plan created.');
      widget.onCreated();
      if (mounted) setState(() => _open = false);
    } catch (e) {
      widget.onNotice(e.toString().replaceFirst(RegExp(r'^ApiException: '), ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _BusinessRow extends StatefulWidget {
  final Map<String, dynamic> row;
  final List<Map<String, dynamic>> plans;
  final VoidCallback onChanged;
  final void Function(String, {bool error}) onNotice;

  const _BusinessRow({required this.row, required this.plans, required this.onChanged, required this.onNotice});

  @override
  State<_BusinessRow> createState() => _BusinessRowState();
}

class _BusinessRowState extends State<_BusinessRow> {
  bool _busy = false;

  String? get _planId => widget.row['planId']?.toString();

  Future<void> _assign(String? planId) async {
    setState(() => _busy = true);
    try {
      await context.read<AdminProvider>().assignBusinessPlan(widget.row['businessId'].toString(), planId);
      widget.onNotice('${widget.row['businessName']} → ${planId == null ? 'unlimited replies' : 'plan applied'}.');
      widget.onChanged();
    } catch (e) {
      widget.onNotice(e.toString().replaceFirst(RegExp(r'^ApiException: '), ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    setState(() => _busy = true);
    try {
      await context.read<AdminProvider>().resetBusinessCycle(widget.row['businessId'].toString());
      widget.onNotice('Cycle counters cleared for ${widget.row['businessName']}. The anchor did not move.');
      widget.onChanged();
    } catch (e) {
      widget.onNotice(e.toString().replaceFirst(RegExp(r'^ApiException: '), ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editCaps() async {
    final msg = TextEditingController(
        text: widget.row['messageLimitOverride'] == null ? '' : widget.row['messageLimitOverride'].toString());
    final cmt = TextEditingController(
        text: widget.row['commentLimitOverride'] == null ? '' : widget.row['commentLimitOverride'].toString());
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Custom caps: ${widget.row['businessName']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Plan: ${_limitLabel(widget.row['planMessageLimit'])} msg · '
              '${_limitLabel(widget.row['planCommentLimit'])} cmt. '
              'Blank = follow plan · 0 = freeze.',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: msg,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Messages', hintText: 'Follow plan', border: OutlineInputBorder(), isDense: true),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: cmt,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Comments', hintText: 'Follow plan', border: OutlineInputBorder(), isDense: true),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Save caps')),
        ],
      ),
    );
    if (saved != true) return;
    try {
      final messageCap = _parseLimit(msg.text);
      final commentCap = _parseLimit(cmt.text);
      await context.read<AdminProvider>().setBusinessCaps(
            widget.row['businessId'].toString(),
            messageLimitOverride: messageCap,
            commentLimitOverride: commentCap,
          );
      widget.onNotice(messageCap == null && commentCap == null
          ? 'Custom caps cleared — following the plan.'
          : 'Custom caps saved.');
      widget.onChanged();
    } catch (e) {
      widget.onNotice(e.toString().replaceFirst(RegExp(r'^FormatException: '), '').replaceFirst(RegExp(r'^ApiException: '), ''),
          error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Card(
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
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text((widget.row['businessName'] ?? 'Store').toString(),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 2),
                      Text(
                        '${(widget.row['businessId'] ?? '').toString().substring(0, 8)} · '
                        '${widget.row['planName'] ?? 'No plan'} · ${widget.row['period'] ?? ''}',
                        style: const TextStyle(fontSize: 10, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _editCaps,
                  child: const Text('Custom caps', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Messenger ${widget.row['messagesUsed'] ?? 0} / ${_limitLabel(widget.row['messageLimit'])}'
              '${widget.row['messageLimitOverride'] != null ? ' (custom)' : ''}'
              ' · Comments ${widget.row['commentsUsed'] ?? 0} / ${_limitLabel(widget.row['commentLimit'])}'
              '${widget.row['commentLimitOverride'] != null ? ' (custom)' : ''}',
              style: const TextStyle(fontSize: 10, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String?>(
                    value: _planId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Assign plan', border: OutlineInputBorder(), isDense: true),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('Unlimited (no plan)')),
                      ...widget.plans.map((p) => DropdownMenuItem<String?>(
                            value: p['id']?.toString(),
                            child: Text((p['name'] ?? '').toString(), overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: _busy ? null : (v) => _assign(v),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy || _planId == null ? null : _reset,
                  child: const Text('Reset cycle', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
