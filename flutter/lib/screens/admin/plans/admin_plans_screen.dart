import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

class AdminPlansScreen extends StatefulWidget {
  const AdminPlansScreen({super.key});

  @override
  State<AdminPlansScreen> createState() => _AdminPlansScreenState();
}

class _AdminPlansScreenState extends State<AdminPlansScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _plans = [];
  List<Map<String, dynamic>> _businesses = [];
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();

    final results = await Future.wait([
      admin.fetchAdminPlans(),
      admin.fetchAdminBusinessPlans(),
    ]);

    if (mounted) {
      setState(() {
        _plans = results[0];
        _businesses = results[1];
        _isLoading = false;
      });
    }
  }

  Future<void> _editCustomCap(Map<String, dynamic> business) async {
    final businessId = (business['id'] ?? '').toString();
    final businessName = (business['name'] ?? 'Store').toString();
    final currentCap = business['customMonthlyReplies']?.toString() ?? '';
    final controller = TextEditingController(text: currentCap);

    final result = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Edit Cap: $businessName'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Custom monthly replies cap wins over the store subscription plan. Leave blank to follow the plan, or set 0 to freeze auto-replies.',
              style: TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Custom Monthly Replies',
                hintText: 'e.g. 2500 (blank = follow plan)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(null), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (result != null && mounted) {
      final int? newCap = result.isEmpty ? null : int.tryParse(result);
      final admin = context.read<AdminProvider>();
      final ok = await admin.updateBusinessCustomCap(businessId, newCap);

      if (mounted) {
        if (ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Custom cap updated for $businessName'), backgroundColor: const Color(0xFF10B981)),
          );
          _loadData();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to update cap'), backgroundColor: AppTheme.danger),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filteredBusinesses = _businesses.where((b) {
      if (_searchQuery.isEmpty) return true;
      final name = (b['name'] ?? '').toString().toLowerCase();
      final slug = (b['slug'] ?? '').toString().toLowerCase();
      return name.contains(_searchQuery.toLowerCase()) || slug.contains(_searchQuery.toLowerCase());
    }).toList();

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.credit_card_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Plans & Fleet Quotas',
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
            'What each plan allows, who is on it, and what happens to them the moment you change it.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 14),

          // Fleet-wide Action Warning Card
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: Color(0xFFF59E0B), width: 1.2),
            ),
            color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, size: 18, color: Color(0xFFF59E0B)),
                      SizedBox(width: 8),
                      Text(
                        'Saving a plan is a fleet-wide action',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFFF59E0B)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Limits are read when the agent is about to reply — never copied onto a business. Edits take effect on the next inbound customer message with no queue to wait for. Blank limit = uncapped; 0 = no replies. A business can also carry a custom cap below.',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (_isLoading) ...[
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          ] else ...[
            // Subscription Plans Grid
            const Text('Platform Plans', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 8),

            if (_plans.isEmpty)
              const Center(child: Text('No active subscription plans defined.'))
            else
              ..._plans.map((p) {
                final name = (p['name'] ?? 'Plan').toString();
                final price = p['priceUsd'] ?? p['price'] ?? 0;
                final limit = p['monthlyReplies'] ?? p['repliesLimit'];
                final count = p['businessCount'] ?? p['businessesCount'] ?? 0;

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            const SizedBox(height: 2),
                            Text(
                              limit == null ? 'Uncapped replies' : '$limit monthly replies',
                              style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '\$$price / mo',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor, fontSize: 13),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '$count stores',
                              style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),

            const SizedBox(height: 16),

            // Store Custom Caps
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Store Overrides & Custom Caps', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                Text('${filteredBusinesses.length} stores', style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary)),
              ],
            ),
            const SizedBox(height: 8),

            TextField(
              onChanged: (val) => setState(() => _searchQuery = val),
              decoration: InputDecoration(
                hintText: 'Search merchant store...',
                prefixIcon: const Icon(Icons.search, size: 18),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 8),

            if (filteredBusinesses.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(16), child: Text('No stores found.')))
            else
              ...filteredBusinesses.map((b) {
                final name = (b['name'] ?? 'Store').toString();
                final planName = (b['planName'] ?? b['plan'] ?? 'No plan').toString();
                final customCap = b['customMonthlyReplies'];

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              const SizedBox(height: 2),
                              Text(
                                'Plan: $planName',
                                style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: (customCap != null ? const Color(0xFF10B981) : Colors.grey).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                customCap != null ? 'CAP: $customCap' : 'FOLLOWS PLAN',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: customCap != null ? const Color(0xFF10B981) : Colors.grey,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            InkWell(
                              onTap: () => _editCustomCap(b),
                              child: const Text(
                                'Edit Cap',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
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
