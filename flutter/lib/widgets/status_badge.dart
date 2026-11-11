import 'package:flutter/material.dart';
import '../config/app_theme.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;
  final double fontSize;

  const StatusBadge({
    super.key,
    required this.status,
    this.label,
    this.fontSize = 11,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String text = label ?? status;

    switch (status.toLowerCase()) {
      case 'done':
      case 'delivered':
      case 'active':
      case 'connected':
      case 'confirmed':
        bg = AppTheme.successBg;
        fg = AppTheme.success;
        if (status.toLowerCase() == 'done') text = 'Resolved';
        break;
      case 'pending':
      case 'waiting':
        bg = AppTheme.warningBg;
        fg = AppTheme.warning;
        break;
      case 'ondelivery':
      case 'shipped':
      case 'processing':
      case 'acknowledged':
        bg = AppTheme.infoBg;
        fg = AppTheme.info;
        if (status.toLowerCase() == 'ondelivery') text = 'On Delivery';
        if (status.toLowerCase() == 'acknowledged') text = 'Confirmed';
        break;
      case 'cancelled':
      case 'disconnected':
      case 'failed':
        bg = AppTheme.dangerBg;
        fg = AppTheme.danger;
        break;
      default:
        bg = Colors.grey.withValues(alpha: 0.12);
        fg = Colors.grey.shade700;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: fg,
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
