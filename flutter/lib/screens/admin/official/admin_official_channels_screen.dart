import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../config/app_theme.dart';
import '../../../../providers/admin_provider.dart';
import 'admin_official_inbox_screen.dart';
import 'admin_official_tickets_screen.dart';
import 'official_migration_card.dart';

class AdminOfficialChannelsScreen extends StatefulWidget {
  const AdminOfficialChannelsScreen({super.key});

  @override
  State<AdminOfficialChannelsScreen> createState() => _AdminOfficialChannelsScreenState();
}

class _AdminOfficialChannelsScreenState extends State<AdminOfficialChannelsScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _channels = [];

  // WhatsApp connect controllers
  final _waTokenController = TextEditingController();
  final _waPhoneIdController = TextEditingController();
  bool _isConnectingWa = false;

  // Settings controllers
  String _availability = 'available';
  final _availabilityNoteController = TextEditingController();
  bool _aiEnabled = true;
  bool _autoReply = true;
  final _toneController = TextEditingController(text: 'friendly');
  final _languageController = TextEditingController(text: 'auto');
  final _instructionsController = TextEditingController();
  bool _isSavingSettings = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  @override
  void dispose() {
    _waTokenController.dispose();
    _waPhoneIdController.dispose();
    _availabilityNoteController.dispose();
    _toneController.dispose();
    _languageController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final admin = context.read<AdminProvider>();

    final results = await Future.wait([
      admin.fetchOfficialChannels(),
      admin.fetchOfficialSettings(),
    ]);

    if (mounted) {
      _channels = results[0] as List<Map<String, dynamic>>;
      final settings = results[1] as Map<String, dynamic>?;
      if (settings != null) {
        _availability = (settings['availability'] ?? 'available').toString();
        _availabilityNoteController.text = (settings['availabilityNote'] ?? '').toString();
        _aiEnabled = settings['aiEnabled'] == true;
        _autoReply = settings['autoReply'] == true;
        _toneController.text = (settings['tone'] ?? 'friendly').toString();
        _languageController.text = (settings['language'] ?? 'auto').toString();
        _instructionsController.text = (settings['instructions'] ?? '').toString();
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleConnectWhatsApp() async {
    final token = _waTokenController.text.trim();
    final phoneId = _waPhoneIdController.text.trim();
    if (token.isEmpty || phoneId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Both permanent access token and phone number ID are required')),
      );
      return;
    }

    setState(() => _isConnectingWa = true);
    final admin = context.read<AdminProvider>();
    final result = await admin.connectOfficialWhatsApp(token, phoneId);

    if (mounted) {
      setState(() => _isConnectingWa = false);
      if (result['verified'] != false && result['id'] != null) {
        _waTokenController.clear();
        _waPhoneIdController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('WhatsApp number connected to Official channels'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verification failed: ${result['error'] ?? 'Meta refused the token'}'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    }
  }

  Future<void> _handleHealthCheck(String channelId) async {
    final admin = context.read<AdminProvider>();
    final check = await admin.verifyOfficialChannel(channelId);

    if (mounted) {
      final verified = check['verified'] == true;
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Row(
            children: [
              Icon(
                verified ? Icons.check_circle : Icons.warning_amber_rounded,
                color: verified ? const Color(0xFF10B981) : AppTheme.danger,
              ),
              const SizedBox(width: 8),
              Text(verified ? 'Health Check Passed' : 'Health Check Failed'),
            ],
          ),
          content: Text(
            verified
                ? 'The channel credentials and webhook are verified and fully responsive.'
                : 'Error: ${check['error'] ?? 'Token did not resolve'}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  Future<void> _handleDisconnect(String channelId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Disconnect Channel?'),
        content: const Text('Inbound messages to this official channel will no longer be handled.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Disconnect', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      final admin = context.read<AdminProvider>();
      final ok = await admin.disconnectOfficialChannel(channelId);
      if (mounted) {
        if (ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Channel disconnected successfully')),
          );
          _loadData();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to disconnect channel'), backgroundColor: AppTheme.danger),
          );
        }
      }
    }
  }

  Future<void> _handleSaveSettings() async {
    setState(() => _isSavingSettings = true);
    final admin = context.read<AdminProvider>();

    try {
      await admin.updateOfficialSettings({
        'availability': _availability,
        'availabilityNote': _availabilityNoteController.text.trim().isNotEmpty
            ? _availabilityNoteController.text.trim()
            : null,
        'aiEnabled': _aiEnabled,
        'autoReply': _autoReply,
        'tone': _toneController.text.trim(),
        'language': _languageController.text.trim(),
        'instructions': _instructionsController.text.trim().isNotEmpty
            ? _instructionsController.text.trim()
            : null,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Official AI settings saved successfully'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving settings: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isSavingSettings = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final migrationPending = context.watch<AdminProvider>().officialMigrationPending;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.public_outlined, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text(
                'Official Channels',
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
            'The messaging accounts that speak for OnlyOrders itself: a customer DMs them with questions about the platform, the AI answers as a person all day, and nothing here belongs to a store storefront.',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
            ),
          ),
          const SizedBox(height: 16),

          if (migrationPending) ...[
            const OfficialMigrationCard(),
            const SizedBox(height: 16),
          ],

          if (_isLoading) ...[
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          ] else ...[
            // Connected Channels List
            if (_channels.isEmpty)
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(Icons.public, size: 40, color: isDark ? Colors.white24 : Colors.black26),
                      const SizedBox(height: 12),
                      const Text(
                        'No official channels connected yet',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Connect a Facebook Page or a WhatsApp number below. Customer DMs then arrive in the official inbox.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                      ),
                    ],
                  ),
                ),
              )
            else
              ..._channels.map((channel) {
                final platform = (channel['platform'] ?? '').toString();
                final label = (channel['label'] ?? channel['platformChannelId'] ?? '').toString();
                final channelId = (channel['id'] ?? '').toString();
                final createdAt = (channel['createdAt'] ?? '').toString();

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryColor.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(
                                platform == 'whatsapp' ? Icons.phone_android : Icons.facebook,
                                color: AppTheme.primaryColor,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    label,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${platform.toUpperCase()} · ${channel['platformChannelId'] ?? ''}',
                                    style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (createdAt.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Connected ${createdAt.split('T').first}',
                            style: TextStyle(fontSize: 10, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            TextButton(
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => const AdminOfficialInboxScreen()),
                              ),
                              child: const Text('Inbox', style: TextStyle(fontSize: 11)),
                            ),
                            TextButton(
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => const AdminOfficialTicketsScreen()),
                              ),
                              child: const Text('Tickets', style: TextStyle(fontSize: 11)),
                            ),
                          ],
                        ),
                        const Divider(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            OutlinedButton.icon(
                              onPressed: () => _handleHealthCheck(channelId),
                              icon: const Icon(Icons.favorite_border, size: 14),
                              label: const Text('Health check', style: TextStyle(fontSize: 11)),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                minimumSize: Size.zero,
                              ),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => _handleDisconnect(channelId),
                              style: TextButton.styleFrom(
                                foregroundColor: AppTheme.danger,
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                minimumSize: Size.zero,
                              ),
                              child: const Text('Disconnect', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),

            const SizedBox(height: 16),

            // Connect WhatsApp Card
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.phone_android, size: 18, color: Color(0xFF10B981)),
                        const SizedBox(width: 8),
                        const Text('Connect WhatsApp', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'A manual token verified with Graph. The number is only stored if Meta answered for it.',
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _waTokenController,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: 'Permanent Access Token',
                        hintText: 'EAAG...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _waPhoneIdController,
                      decoration: InputDecoration(
                        labelText: 'Phone Number ID',
                        hintText: 'e.g. 1029384756',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isConnectingWa ? null : _handleConnectWhatsApp,
                        icon: _isConnectingWa
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.link, size: 16),
                        label: Text(_isConnectingWa ? 'Connecting...' : 'Connect WhatsApp'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Official AI Configuration
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.psychology_outlined, size: 18, color: AppTheme.primaryColor),
                        const SizedBox(width: 8),
                        const Text('How the official AI answers', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Availability is stated to every new customer; disabling leaves conversations for operators alone.',
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                    const SizedBox(height: 16),

                    // Availability Dropdown
                    const Text('Availability', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: isDark ? Colors.white24 : Colors.black26),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _availability,
                          items: const [
                            DropdownMenuItem(
                              value: 'available',
                              child: Text('Available for new clients', style: TextStyle(fontSize: 12)),
                            ),
                            DropdownMenuItem(
                              value: 'taking_onboarding_requests',
                              child: Text('Not available — taking onboarding requests', style: TextStyle(fontSize: 12)),
                            ),
                          ],
                          onChanged: (val) {
                            if (val != null) setState(() => _availability = val);
                          },
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Availability Note
                    TextField(
                      controller: _availabilityNoteController,
                      decoration: InputDecoration(
                        labelText: 'Availability Note',
                        hintText: 'e.g. backlog until August, only small storefronts',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Switches
                    SwitchListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: const Text('AI Enabled', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text('AI will answer new inquiries', style: TextStyle(fontSize: 11)),
                      value: _aiEnabled,
                      activeColor: AppTheme.primaryColor,
                      onChanged: (v) => setState(() => _aiEnabled = v),
                    ),
                    SwitchListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Auto-reply on new messages', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text('Trigger immediate response without manual approval', style: TextStyle(fontSize: 11)),
                      value: _autoReply,
                      activeColor: AppTheme.primaryColor,
                      onChanged: (v) => setState(() => _autoReply = v),
                    ),
                    const SizedBox(height: 8),

                    // Tone & Language
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _toneController,
                            decoration: InputDecoration(
                              labelText: 'Tone',
                              hintText: 'e.g. friendly',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _languageController,
                            decoration: InputDecoration(
                              labelText: 'Language',
                              hintText: 'e.g. auto',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                              isDense: true,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Instructions Textarea
                    TextField(
                      controller: _instructionsController,
                      maxLines: 4,
                      maxLength: 8000,
                      decoration: InputDecoration(
                        labelText: 'Instructions for the AI',
                        hintText: 'Anything the AI must always follow when answering official inboxes.',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 12),

                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isSavingSettings ? null : _handleSaveSettings,
                        icon: _isSavingSettings
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.check, size: 16),
                        label: Text(_isSavingSettings ? 'Saving...' : 'Save Settings'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // TikTok Card
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('TikTok Business Messages', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      'TikTok Business Messages is not yet offered publicly, so OnlyOrders connects it when a public partner API exists. Nothing is faked in the meantime.',
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
