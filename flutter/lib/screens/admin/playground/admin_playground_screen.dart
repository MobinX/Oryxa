import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/api_config.dart';
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

  String? _loadError;

  Future<void> _initBusinesses() async {
    final admin = context.read<AdminProvider>();
    List<Map<String, dynamic>> businesses = [];
    try {
      // The playground runs on merchant endpoints with the operator Firebase
      // token, so read the real business list with that token. The admin plans
      // endpoint returns `businessId`/`businessName`, not id/name/slug, and
      // using those fields here produced an empty/fake sandbox id.
      final res = await admin.apiService.get(ApiConfig.pathBusinesses);
      if (res is Map && res['businesses'] is List) {
        businesses = (res['businesses'] as List)
            .whereType<Map>()
            .map((b) => Map<String, dynamic>.from(b))
            .toList();
      }
    } catch (e) {
      _loadError = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
    }

    if (!mounted) return;
    final sandbox = businesses.firstWhere(
      (b) => (b['slug'] ?? '').toString() == 'oryxa-sandbox',
      orElse: () => <String, dynamic>{},
    );

    setState(() {
      _businesses = businesses
          .map((b) => {
                'id': b['id'],
                'name': b['name'],
                'slug': b['slug'],
              })
          .toList();
      if (sandbox.isNotEmpty) {
        _selectedBusinessId = sandbox['id']?.toString();
        _selectedBusinessName = (sandbox['name'] ?? 'Sandbox Store').toString();
        _selectedBusinessSlug = 'oryxa-sandbox';
      }
      _isLoading = false;
    });
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
        id: _selectedBusinessId ?? '',
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
          if (_selectedBusinessId != null && _businesses.isNotEmpty) ...[
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
          : _selectedBusinessId == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          _loadError ??
                              'The operator sandbox store (oryxa-sandbox) was not found. Seed it before using the playground.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ),
                  ),
                )
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
