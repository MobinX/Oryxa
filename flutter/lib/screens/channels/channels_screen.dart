import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../providers/business_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/status_badge.dart';

class ChannelsScreen extends StatefulWidget {
  const ChannelsScreen({super.key});

  @override
  State<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends State<ChannelsScreen> {
  final _pageIdController = TextEditingController();
  final _pageNameController = TextEditingController();

  @override
  void dispose() {
    _pageIdController.dispose();
    _pageNameController.dispose();
    super.dispose();
  }

  void _showConnectDialog(String platformName) {
    _pageIdController.clear();
    _pageNameController.clear();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Connect $platformName'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Link your official $platformName so the AI agent can receive messages and reply to customers.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _pageNameController,
              decoration: InputDecoration(
                labelText: '$platformName Name',
                hintText: 'e.g. Dhaka Store Official',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pageIdController,
              decoration: const InputDecoration(
                labelText: 'Platform Channel / Page ID',
                hintText: 'e.g. 1048291048591',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Connected $platformName successfully!')),
              );
            },
            child: const Text('Connect Channel'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final connectedChannels = biz.channels;

    final defaultChannels = [
      {
        'platform': 'facebook',
        'title': 'Facebook Page',
        'subtitle': 'Messenger chat & comment replies',
        'icon': Icons.facebook,
        'color': const Color(0xFF1877F2),
      },
      {
        'platform': 'instagram',
        'title': 'Instagram Business',
        'subtitle': 'Direct Messages & post comments',
        'icon': Icons.camera_alt,
        'color': const Color(0xFFE1306C),
      },
      {
        'platform': 'whatsapp',
        'title': 'WhatsApp Cloud API',
        'subtitle': 'Direct WhatsApp customer chat',
        'icon': Icons.chat_bubble,
        'color': const Color(0xFF25D366),
      },
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Channels & Integrations')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Connect Social Sales Channels',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            'Connect social media pages to allow the LangGraph AI sales agent to handle inquiries and generate orders.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.4),
          ),
          const SizedBox(height: 16),

          ...defaultChannels.map((item) {
            final platform = item['platform'] as String;
            final isConnected = connectedChannels.any((c) => c.platform == platform);
            final channel = connectedChannels.cast<ChannelModel?>().firstWhere(
                  (c) => c?.platform == platform,
                  orElse: () => null,
                );

            return AppCard(
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: (item['color'] as Color).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(item['icon'] as IconData, color: item['color'] as Color, size: 26),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          channel?.pageName ?? item['title'] as String,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item['subtitle'] as String,
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 6),
                        StatusBadge(status: isConnected ? 'connected' : 'disconnected'),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isConnected ? Colors.grey.shade200 : AppTheme.primaryColor,
                      foregroundColor: isConnected ? Colors.black87 : Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    ),
                    onPressed: () => _showConnectDialog(item['title'] as String),
                    child: Text(isConnected ? 'Configure' : 'Connect', style: const TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
