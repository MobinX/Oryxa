import 'package:flutter/material.dart';

import '../../../config/app_theme.dart';

class AdminChannelsScreen extends StatelessWidget {
  const AdminChannelsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Icon(Icons.radio_outlined, color: AppTheme.primaryColor),
            const SizedBox(width: 8),
            Text(
              'Store Channels Platform',
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
          'Omnichannel integrations, webhook listeners, and platform page routing.',
          style: TextStyle(
            fontSize: 13,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 16),
        _buildChannelCard(
          name: 'Meta Messenger',
          type: 'facebook',
          status: 'Active · Receiver Online',
          icon: Icons.facebook,
          color: const Color(0xFF1877F2),
          isDark: isDark,
        ),
        const SizedBox(height: 12),
        _buildChannelCard(
          name: 'Instagram Direct',
          type: 'instagram',
          status: 'Active · Graph API v21.0',
          icon: Icons.camera_alt_outlined,
          color: const Color(0xFFE4405F),
          isDark: isDark,
        ),
        const SizedBox(height: 12),
        _buildChannelCard(
          name: 'Storefront Live Chat',
          type: 'widget',
          status: 'Active · Hosted SDK',
          icon: Icons.chat_outlined,
          color: AppTheme.primaryColor,
          isDark: isDark,
        ),
      ],
    );
  }

  Widget _buildChannelCard({
    required String name,
    required String type,
    required String status,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 24),
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        subtitle: Text(status, style: const TextStyle(fontSize: 12)),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}
