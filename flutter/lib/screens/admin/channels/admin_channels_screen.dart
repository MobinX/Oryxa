import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/api_config.dart';
import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Admin-only Facebook Pages. The web page opens an OAuth flow then shows a page
/// picker; here we open the same auth URL and ask the operator to paste the page
/// selection token from the returning URL (the token is a signed, short-lived value).
class AdminChannelsScreen extends StatefulWidget {
  const AdminChannelsScreen({super.key});

  @override
  State<AdminChannelsScreen> createState() => _AdminChannelsScreenState();
}

class _AdminChannelsScreenState extends State<AdminChannelsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _channels = [];
  String? _error;
  bool _busy = false;
  final _tokenController = TextEditingController();
  final Set<String> _selected = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await context
          .read<AdminProvider>()
          .apiService
          .get(ApiConfig.pathAdminChannels);
      if (!mounted) return;
      final rows = res is Map && res['channels'] is List ? res['channels'] as List : const [];
      setState(() {
        _channels = rows.map((c) => Map<String, dynamic>.from(c as Map)).toList();
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
          _loading = false;
        });
      }
    }
  }

  Future<void> _startFacebook() async {
    setState(() => _busy = true);
    try {
      final url = await context.read<AdminProvider>().fetchFacebookAuthUrl();
      if (url == null || url.isEmpty) throw Exception('The API did not return a Facebook sign-in URL.');
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw Exception('Could not open a browser for Facebook.');
      }
      if (!mounted) return;
      _tokenController.clear();
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Choose Pages'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'After Meta signs you in, the browser shows a page-picker URL ending in '
                '"?token=…". Copy that token and paste it here to load your Pages.',
                style: TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _tokenController,
                decoration: const InputDecoration(
                  labelText: 'Page selection token',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                final token = _tokenController.text.trim();
                Navigator.of(ctx).pop();
                if (token.isNotEmpty) _loadPages(token);
              },
              child: const Text('Load pages'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Connect failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadPages(String token) async {
    setState(() {
      _busy = true;
      _error = null;
      _selected.clear();
    });
    try {
      final pages = await context.read<AdminProvider>().fetchFacebookPendingPages(token);
      if (!mounted) return;
      showModalBottomSheet(useSafeArea: true,
        context: context,
        isScrollControlled: true,
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.75,
          builder: (ctx, controller) => StatefulBuilder(
            builder: (ctx, setSheet) => Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text('Choose Pages',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      ),
                      IconButton(
                          onPressed: () => Navigator.of(ctx).pop(), icon: const Icon(Icons.close)),
                    ],
                  ),
                ),
                Expanded(
                  child: pages.isEmpty
                      ? const Center(child: Text('Facebook returned no Pages for this login.'))
                      : ListView.builder(
                          controller: controller,
                          itemCount: pages.length,
                          itemBuilder: (ctx, i) {
                            final page = pages[i];
                            final id = (page['id'] ?? '').toString();
                            final held = page['heldByStore'] == true;
                            return CheckboxListTile(
                              value: _selected.contains(id),
                              title: Text((page['name'] ?? '').toString()),
                              subtitle: Text('Page id $id'
                                  '${held ? ' · Connected to a store' : ''}'
                                  '${page['connected'] == true ? ' · Admin channel' : ''}'),
                              onChanged: held
                                  ? null
                                  : (v) {
                                      setSheet(() {
                                        if (v == true) {
                                          _selected.add(id);
                                        } else {
                                          _selected.remove(id);
                                        }
                                      });
                                    },
                            );
                          },
                        ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                      16, 16, 16, 16 + MediaQuery.viewPaddingOf(ctx).bottom),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _selected.isEmpty
                          ? null
                          : () async {
                              Navigator.of(ctx).pop();
                              await _connect(token);
                            },
                      child: const Text('Connect selected'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not load Pages: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _connect(String token) async {
    setState(() => _busy = true);
    try {
      final result = await context.read<AdminProvider>().connectFacebookPages(token, _selected.toList());
      final connected = (result['connected'] as List? ?? []).length;
      final failed = (result['failed'] as List? ?? []);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$connected page${connected == 1 ? '' : 's'} connected'
                '${failed.isEmpty ? '' : ' · ${failed.length} failed'}'),
            backgroundColor: failed.isEmpty ? const Color(0xFF10B981) : Colors.amber,
          ),
        );
      }
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Connect failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              const Icon(Icons.radio_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text('Admin channels',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                  )),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Pages that answer no customers. Their DMs only redeem a business\'s notification code; '
            'every notice a business stores is also sent to those Messenger accounts.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _busy ? null : _startFacebook,
              icon: const Icon(Icons.facebook, size: 18),
              label: Text(_busy ? 'Working…' : 'Connect Facebook Page'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1877F2),
                foregroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Card(
              color: AppTheme.dangerBg,
              child: Padding(padding: const EdgeInsets.all(14), child: Text(_error!)),
            ),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else if (_channels.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Column(
                  children: [
                    Icon(Icons.radio, size: 40, color: Colors.grey),
                    SizedBox(height: 12),
                    Text('No admin channel yet', style: TextStyle(fontWeight: FontWeight.bold)),
                    SizedBox(height: 6),
                    Text(
                      'Connect a Page above. Merchants then send their notification code to it as a message.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            )
          else
            ..._channels.map((channel) {
              final createdAt = (channel['createdAt'] ?? '').toString();
              return Card(
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: ListTile(
                  leading: const Icon(Icons.facebook, color: Color(0xFF1877F2)),
                  title: Text((channel['pageName'] ?? '').toString(),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text('Page id ${channel['pageId'] ?? ''}'
                      '${createdAt.isNotEmpty ? ' · Connected ${createdAt.split('T').first}' : ''}'),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('ADMIN ONLY',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                  ),
                ),
              );
            }),
          const SizedBox(height: 8),
          const Text('Need another Page? The picker lists every Page your Facebook login manages.',
              style: TextStyle(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }
}
