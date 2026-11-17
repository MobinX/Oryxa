import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../models/business.dart';
import '../../../providers/admin_provider.dart';
import '../../playground/playground_screen.dart';

class AdminPlaygroundScreen extends StatefulWidget {
  const AdminPlaygroundScreen({super.key});

  @override
  State<AdminPlaygroundScreen> createState() => _AdminPlaygroundScreenState();
}

class _AdminPlaygroundScreenState extends State<AdminPlaygroundScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _businesses = [];
  String? _selectedBusinessId;
  String _selectedBusinessName = 'Sandbox Store';
  String _selectedBusinessSlug = 'oryxa-sandbox';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initBusinesses());
  }

  Future<void> _initBusinesses() async {
    final admin = context.read<AdminProvider>();
    final businesses = await admin.fetchAdminBusinessPlans();

    if (mounted) {
      setState(() {
        _businesses = businesses;
        if (businesses.isNotEmpty) {
          // Look for sandbox store first
          final sandbox = businesses.firstWhere(
            (b) =>
                (b['slug'] ?? '').toString() == 'oryxa-sandbox' ||
                (b['name'] ?? '').toString().toLowerCase().contains('sandbox'),
            orElse: () => businesses.first,
          );
          _selectedBusinessId = (sandbox['id'] ?? '').toString();
          _selectedBusinessName = (sandbox['name'] ?? 'Sandbox Store').toString();
          _selectedBusinessSlug = (sandbox['slug'] ?? 'oryxa-sandbox').toString();
        } else {
          // Default fallback sandbox
          _selectedBusinessId = 'oryxa-sandbox-id';
          _selectedBusinessName = 'Oryxa Sandbox';
          _selectedBusinessSlug = 'oryxa-sandbox';
        }
        _isLoading = false;
      });
    }
  }

  void _onStoreChanged(String? newId) {
    if (newId == null) return;
    final match = _businesses.firstWhere((b) => (b['id'] ?? '').toString() == newId, orElse: () => {});
    setState(() {
      _selectedBusinessId = newId;
      _selectedBusinessName = (match['name'] ?? 'Store').toString();
      _selectedBusinessSlug = (match['slug'] ?? 'store').toString();
    });
  }

  BusinessModel get _currentSelectedBusiness => BusinessModel(
        id: _selectedBusinessId ?? 'oryxa-sandbox',
        name: _selectedBusinessName,
        slug: _selectedBusinessSlug,
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.smart_toy_outlined, size: 20, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text(
                  'Operator Playground',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              'Testing against $_selectedBusinessName (${_selectedBusinessSlug})',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
              ),
            ),
          ],
        ),
        actions: [
          if (_businesses.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedBusinessId,
                  icon: const Icon(Icons.store, size: 18),
                  items: _businesses.map((b) {
                    final id = (b['id'] ?? '').toString();
                    final name = (b['name'] ?? 'Store').toString();
                    return DropdownMenuItem<String>(
                      value: id,
                      child: Text(
                        name,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    );
                  }).toList(),
                  onChanged: _onStoreChanged,
                ),
              ),
            ),
          ],
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Testing Banner Notice
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                  child: Row(
                    children: [
                      const Icon(Icons.science_outlined, size: 16, color: AppTheme.primaryColor),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Simulating live conversations with store catalog and AI tools active.',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Live Playground Widget hooked directly to selected store
                Expanded(
                  child: PlaygroundScreen(
                    key: ValueKey(_selectedBusinessId),
                    business: _currentSelectedBusiness,
                  ),
                ),
              ],
            ),
    );
  }
}
