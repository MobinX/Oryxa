import 'package:flutter/material.dart';

class ChannelModel {
  final String id;
  final String businessId;
  final String platform; // 'facebook', 'instagram', 'whatsapp'
  final String? platformChannelId;
  final String? pageName;
  final String status;
  final DateTime? createdAt;

  ChannelModel({
    required this.id,
    required this.businessId,
    required this.platform,
    this.platformChannelId,
    this.pageName,
    this.status = 'active',
    this.createdAt,
  });

  bool get isFacebook => platform == 'facebook';
  bool get isInstagram => platform == 'instagram';
  bool get isWhatsApp => platform == 'whatsapp';

  String get displayName {
    if (pageName != null && pageName!.isNotEmpty) {
      return pageName!;
    }
    switch (platform) {
      case 'facebook':
        return 'Facebook Page';
      case 'instagram':
        return 'Instagram Account';
      case 'whatsapp':
        return 'WhatsApp Business';
      default:
        return platform;
    }
  }

  Color get brandColor {
    switch (platform) {
      case 'facebook':
        return const Color(0xFF1877F2);
      case 'instagram':
        return const Color(0xFFE1306C);
      case 'whatsapp':
        return const Color(0xFF25D366);
      default:
        return const Color(0xFF5B3DF5);
    }
  }

  IconData get iconData {
    switch (platform) {
      case 'facebook':
        return Icons.facebook;
      case 'instagram':
        return Icons.camera_alt;
      case 'whatsapp':
        return Icons.chat_bubble;
      default:
        return Icons.link;
    }
  }

  factory ChannelModel.fromJson(Map<String, dynamic> json) {
    String? pName = json['pageName']?.toString();
    if (pName == null && json['extraInfo'] != null) {
      try {
        // Can be JSON encoded in extraInfo
        // If not already parsed
      } catch (_) {}
    }

    return ChannelModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      platform: json['platform']?.toString() ?? 'facebook',
      platformChannelId: json['platformChannelId']?.toString(),
      pageName: pName,
      status: json['status']?.toString() ?? 'active',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}
