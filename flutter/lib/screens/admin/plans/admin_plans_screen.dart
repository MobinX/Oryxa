import 'package:flutter/material.dart';

import '../../../config/app_theme.dart';

class AdminPlansScreen extends StatelessWidget {
  const AdminPlansScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Icon(Icons.credit_card_outlined, color: AppTheme.primaryColor),
            const SizedBox(width: 8),
            Text(
              'Store Subscription Plans',
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
          'Manage platform merchant tiers, order quotas, and feature caps.',
          style: TextStyle(
            fontSize: 13,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 16),
        _buildTierCard(
          title: 'Free Starter',
          price: '\$0 / mo',
          features: ['Up to 50 conversations', 'Single channel integration', 'Community support'],
          isDark: isDark,
        ),
        const SizedBox(height: 12),
        _buildTierCard(
          title: 'Growth Merchant',
          price: '\$29 / mo',
          features: ['Up to 1,000 conversations', 'Multi-channel (Messenger, WhatsApp)', 'AI Agent autonomy'],
          isDark: isDark,
          highlight: true,
        ),
        const SizedBox(height: 12),
        _buildTierCard(
          title: 'Scale Enterprise',
          price: '\$99 / mo',
          features: ['Unlimited conversations', 'Custom domain & full branding', 'Dedicated priority SLA'],
          isDark: isDark,
        ),
      ],
    );
  }

  Widget _buildTierCard({
    required String title,
    required String price,
    required List<String> features,
    required bool isDark,
    bool highlight = false,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: highlight ? AppTheme.primaryColor : (isDark ? Colors.white10 : Colors.black12),
          width: highlight ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: highlight ? AppTheme.primaryColor : null,
                  ),
                ),
                Text(
                  price,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...features.map((f) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_outline, size: 16, color: Color(0xFF10B981)),
                      const SizedBox(width: 8),
                      Text(f, style: const TextStyle(fontSize: 13)),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
