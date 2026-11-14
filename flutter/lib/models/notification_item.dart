class NotificationMessengerDelivery {
  final String status; // 'delivered' | 'partial' | 'failed' | 'no_recipients'
  final int recipients;
  final int delivered;
  final String? detail;

  NotificationMessengerDelivery({
    required this.status,
    required this.recipients,
    required this.delivered,
    this.detail,
  });

  factory NotificationMessengerDelivery.fromJson(Map<String, dynamic> json) {
    return NotificationMessengerDelivery(
      status: json['status']?.toString() ?? 'failed',
      recipients: (json['recipients'] as num?)?.toInt() ?? 0,
      delivered: (json['delivered'] as num?)?.toInt() ?? 0,
      detail: json['detail']?.toString(),
    );
  }
}

class NotificationItemModel {
  final String id;
  final String businessId;
  final String kind;
  final String? period;
  final String? title;
  final String? body;
  final String? link;
  final NotificationMessengerDelivery? messenger;
  final DateTime? readAt;
  final DateTime createdAt;

  NotificationItemModel({
    required this.id,
    this.businessId = '',
    required this.kind,
    this.period,
    this.title,
    this.body,
    this.link,
    this.messenger,
    this.readAt,
    required this.createdAt,
  });

  bool get isRead => readAt != null;
  bool get read => isRead;
  String? get message => body;
  DateTime get time => createdAt;

  String get displayTitle {
    if (title != null && title!.trim().isNotEmpty) return title!;
    if (kind == 'order_placed') return 'New order received';
    if (kind == 'payment_order_failed') return 'Payment received but order failed';
    if (kind == 'human_help') return 'Human support requested';
    final unit = kind.startsWith('comment') ? 'comment' : 'messenger';
    if (kind.endsWith('_100')) {
      return 'Your $unit replies are used up';
    }
    if (kind.endsWith('_80')) {
      return 'You have used 80% of your $unit replies';
    }
    return 'System notification';
  }

  String? get actionLabel {
    if (link == null || link!.isEmpty) return null;
    if (kind == 'order_placed') return 'Open order';
    if (kind == 'payment_order_failed' || kind == 'human_help') return 'Open Inbox';
    return 'Open billing';
  }

  String get formattedDate {
    final now = DateTime.now();
    final diff = now.difference(createdAt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';

    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final min = createdAt.minute.toString().padLeft(2, '0');
    return '${createdAt.day} ${months[createdAt.month - 1]}, $hour:$min';
  }

  NotificationItemModel copyWith({
    String? id,
    String? businessId,
    String? kind,
    String? period,
    String? title,
    String? body,
    String? link,
    NotificationMessengerDelivery? messenger,
    DateTime? readAt,
    DateTime? createdAt,
  }) {
    return NotificationItemModel(
      id: id ?? this.id,
      businessId: businessId ?? this.businessId,
      kind: kind ?? this.kind,
      period: period ?? this.period,
      title: title ?? this.title,
      body: body ?? this.body,
      link: link ?? this.link,
      messenger: messenger ?? this.messenger,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory NotificationItemModel.fromJson(Map<String, dynamic> json) {
    DateTime? parsedReadAt;
    if (json['readAt'] != null) {
      parsedReadAt = DateTime.tryParse(json['readAt'].toString());
    } else if (json['read'] == true) {
      parsedReadAt = DateTime.now();
    }

    DateTime parsedCreated = DateTime.now();
    if (json['createdAt'] != null) {
      parsedCreated = DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now();
    } else if (json['time'] != null) {
      parsedCreated = DateTime.tryParse(json['time'].toString()) ?? DateTime.now();
    }

    return NotificationItemModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      kind: json['kind']?.toString() ?? 'general',
      period: json['period']?.toString(),
      title: json['title']?.toString(),
      body: json['body']?.toString() ?? json['message']?.toString() ?? json['desc']?.toString(),
      link: json['link']?.toString(),
      messenger: json['messenger'] is Map<String, dynamic>
          ? NotificationMessengerDelivery.fromJson(json['messenger'] as Map<String, dynamic>)
          : null,
      readAt: parsedReadAt,
      createdAt: parsedCreated,
    );
  }
}

class MessengerFollower {
  final String id;
  final String? name;
  final DateTime connectedAt;
  final DateTime? lastPingAt;
  final DateTime? nextPingDueAt;

  MessengerFollower({
    required this.id,
    this.name,
    required this.connectedAt,
    this.lastPingAt,
    this.nextPingDueAt,
  });

  bool get isPingUrgent {
    if (nextPingDueAt == null) return true;
    final remaining = nextPingDueAt!.difference(DateTime.now());
    return remaining.inDays < 1;
  }

  String get formattedConnectedDate {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${connectedAt.day} ${months[connectedAt.month - 1]} ${connectedAt.year}';
  }

  String? get formattedPingDue {
    if (nextPingDueAt == null) return null;
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${nextPingDueAt!.day} ${months[nextPingDueAt!.month - 1]} ${nextPingDueAt!.year}';
  }

  String? get formattedLastPing {
    if (lastPingAt == null) return null;
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${lastPingAt!.day} ${months[lastPingAt!.month - 1]} ${lastPingAt!.year}';
  }

  factory MessengerFollower.fromJson(Map<String, dynamic> json) {
    return MessengerFollower(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString(),
      connectedAt: DateTime.tryParse(json['connectedAt']?.toString() ?? '') ?? DateTime.now(),
      lastPingAt: json['lastPingAt'] != null ? DateTime.tryParse(json['lastPingAt'].toString()) : null,
      nextPingDueAt: json['nextPingDueAt'] != null ? DateTime.tryParse(json['nextPingDueAt'].toString()) : null,
    );
  }
}

class MessengerOverview {
  final String? code;
  final List<MessengerFollower> users;

  MessengerOverview({
    this.code,
    required this.users,
  });

  factory MessengerOverview.fromJson(Map<String, dynamic> json) {
    final usersList = (json['users'] as List?)
            ?.map((u) => MessengerFollower.fromJson(u as Map<String, dynamic>))
            .toList() ??
        [];
    return MessengerOverview(
      code: json['code']?.toString(),
      users: usersList,
    );
  }
}

class PushTestResult {
  final int tokens;
  final int sent;
  final int failed;
  final int removed;
  final String? skipped;
  final String? firstError;
  final String? error;

  PushTestResult({
    required this.tokens,
    required this.sent,
    required this.failed,
    required this.removed,
    this.skipped,
    this.firstError,
    this.error,
  });

  String get summaryMessage {
    if (error != null && error!.isNotEmpty) return error!;
    if (skipped == 'not-configured') {
      return 'The server is not configured to send pushes (Firebase Admin credentials missing).';
    }
    if (skipped == 'no-tokens') {
      return 'No device/browser is registered for this business yet.';
    }
    if (sent > 0) {
      return 'Test push sent to $sent registered recipient${sent == 1 ? '' : 's'}. Check your device notifications.';
    }
    if (firstError != null && firstError!.isNotEmpty) {
      return 'FCM rejected the push: $firstError';
    }
    return 'Push delivery finished (tokens: $tokens, sent: $sent, failed: $failed).';
  }

  factory PushTestResult.fromJson(Map<String, dynamic> json) {
    return PushTestResult(
      tokens: (json['tokens'] as num?)?.toInt() ?? 0,
      sent: (json['sent'] as num?)?.toInt() ?? 0,
      failed: (json['failed'] as num?)?.toInt() ?? 0,
      removed: (json['removed'] as num?)?.toInt() ?? 0,
      skipped: json['skipped']?.toString(),
      firstError: json['firstError']?.toString(),
      error: json['error']?.toString(),
    );
  }
}
