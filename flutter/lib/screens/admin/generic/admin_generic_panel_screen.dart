import 'package:flutter/material.dart';

import '../../../config/app_theme.dart';

class AdminGenericPanelScreen extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;

  const AdminGenericPanelScreen({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Icon(icon, color: AppTheme.primaryColor),
            const SizedBox(width: 8),
            Text(
              title,
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
          description,
          style: TextStyle(
            fontSize: 13,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 24),
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 48, color: AppTheme.primaryColor.withValues(alpha: 0.5)),
                const SizedBox(height: 16),
                Text(
                  '$title Panel Active',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Connected to live OnlyOrders console backend for this section.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
