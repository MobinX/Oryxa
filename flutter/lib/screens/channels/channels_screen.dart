import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../providers/business_provider.dart';
import '../../services/facebook_connect_service.dart';
import '../../widgets/app_card.dart';

class ChannelsScreen extends StatefulWidget {
  const ChannelsScreen({super.key});

  @override
  State<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends State<ChannelsScreen> {
  bool _isConnecting = false;

  @override
  void initState() {
    super.initState();
    final fb = context.read<FacebookConnectService>();
    fb.addListener(_onFacebookResult);
    // Handle a result that arrived before this screen was mounted.
    if (fb.pendingResult != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _handlePending(fb.pendingResult!));
    }
  }

  @override
  void dispose() {
    context.read<FacebookConnectService>().removeListener(_onFacebookResult);
    super.dispose();
  }

  void _onFacebookResult() {
    final fb = context.read<FacebookConnectService>();
    final result = fb.pendingResult;
    if (result != null) {
      _handlePending(result);
    }
  }

  Future<void> _handlePending(FacebookConnectResult result) async {
    final fb = context.read<FacebookConnectService>();
    fb.clearPendingResult();
    final businessId = result.businessId ?? context.read<BusinessProvider>().currentBusiness?.id;
    if (businessId == null) return;
    await _showPagePicker(businessId, result.token);
  }

  Future<void> _showPagePicker(String businessId, String token) async {
    final fb = context.read<FacebookConnectService>();
    List<FacebookPendingPage> pages;
    try {
      pages = await fb.fetchPendingPages(businessId, token);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load pages: $e'), backgroundColor: AppTheme.danger),
      );
      return;
    }
    if (!mounted) return;

    final selected = <String>{};
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Choose Facebook pages'),
          content: SizedBox(
            width: double.maxFinite,
            child: pages.isEmpty
                ? const Text('No Facebook pages found on this account.')
                : ListView(
                    shrinkWrap: true,
                    children: pages.map((page) {
                      final disabled = page.heldByOtherStore;
                      return CheckboxListTile(
                        value: selected.contains(page.id),
                        onChanged: disabled
                            ? null
                            : (v) {
                                setDialogState(() {
                                  if (v == true) {
                                    selected.add(page.id);
                                  } else {
                                    selected.remove(page.id);
                                  }
                                });
                              },
                        title: Text(page.name),
                        subtitle: Text(
                          page.heldByOtherStore
                              ? 'Already connected to another store'
                              : page.connected
                                  ? 'Already connected — select to refresh token'
                                  : 'Page ID: ${page.id}',
                          style: TextStyle(
                            fontSize: 11,
                            color: page.heldByOtherStore ? AppTheme.danger : null,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: selected.isEmpty
                  ? null
                  : () async {
                      Navigator.pop(ctx);
                      await _connectSelected(businessId, token, selected.toList());
                    },
              child: Text('Connect selected (${selected.length})'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _connectSelected(String businessId, String token, List<String> pageIds) async {
    final fb = context.read<FacebookConnectService>();
    try {
      final result = await fb.connectPages(businessId, token, pageIds);
      if (!mounted) return;
      final connected = (result['connected'] as List?)?.length ?? 0;
      final failed = (result['failed'] as List?) ?? const [];
      final biz = context.read<BusinessProvider>();
      await biz.loadActiveBusinessData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(failed.isEmpty
              ? 'Connected $connected Facebook page(s).'
              : 'Connected $connected, ${failed.length} failed.'),
          backgroundColor: failed.isEmpty ? null : AppTheme.danger,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Connect failed: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  Future<void> _startConnect() async {
    final biz = context.read<BusinessProvider>();
    final businessId = biz.currentBusiness?.id;
    if (businessId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a store first.')),
      );
      return;
    }

    // Consent + source + ads dialog
    bool portfolio = false;
    bool ads = false;
    final proceed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Connect Facebook'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'OnlyOrders will request permission to manage messages, view your Pages list, and receive webhooks.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 12),
                const Text('Where are your Pages?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                RadioListTile<bool>(
                  title: const Text('Pages on my profile', style: TextStyle(fontSize: 13)),
                  value: false,
                  groupValue: portfolio,
                  onChanged: (v) => setDialogState(() => portfolio = v ?? false),
                ),
                RadioListTile<bool>(
                  title: const Text('Pages inside a business portfolio', style: TextStyle(fontSize: 13)),
                  value: true,
                  groupValue: portfolio,
                  onChanged: (v) => setDialogState(() => portfolio = v ?? true),
                ),
                CheckboxListTile(
                  title: const Text('Also connect ad reporting (read-only)', style: TextStyle(fontSize: 13)),
                  value: ads,
                  onChanged: (v) => setDialogState(() => ads = v ?? false),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Continue')),
          ],
        ),
      ),
    );
    if (proceed != true) return;

    setState(() => _isConnecting = true);
    try {
      final fb = context.read<FacebookConnectService>();
      final result = await fb.startConnect(businessId: businessId, portfolio: portfolio, ads: ads);
      if (!mounted) return;
      await _showPagePicker(businessId, result.token);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Facebook connect failed: $e'), backgroundColor: AppTheme.danger),
      );
    } finally {
      if (mounted) setState(() => _isConnecting = false);
    }
  }

  Future<void> _deleteChannel(ChannelModel channel) async {
    final biz = context.read<BusinessProvider>();
    final ok = await biz.deleteChannel(channel.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Channel deleted.' : (biz.errorMessage ?? 'Delete failed.')),
        backgroundColor: ok ? null : AppTheme.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final channels = biz.channels;

    return Scaffold(
      appBar: AppBar(title: const Text('Channels')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Connect Facebook Messenger', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'Link your Facebook Page to enable AI-powered Messenger replies.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: _isConnecting ? null : _startConnect,
                  icon: _isConnecting
                      ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.facebook),
                  label: Text(_isConnecting ? 'Connecting…' : 'Connect Facebook'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('Connected channels', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          if (channels.isEmpty)
            const Text('No channels connected yet.', style: TextStyle(fontSize: 13, color: Colors.grey))
          else
            ...channels.map((c) => AppCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.pageName ?? c.platform, style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text(c.platformChannelId ?? '', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete, color: AppTheme.danger),
                        onPressed: () => _deleteChannel(c),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }
}
