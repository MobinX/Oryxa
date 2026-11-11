class NotificationItemModel {
  final String id;
  final String businessId;
  final String kind;
  final String? title;
  final String? message;
  final bool read;
  final DateTime time;

  NotificationItemModel({
    required this.id,
    required this.businessId,
    required this.kind,
    this.title,
    this.message,
    this.read = false,
    required this.time,
  });

  String get displayTitle {
    if (title != null && title!.isNotEmpty) return title!;
    switch (kind) {
      case 'order_placed':
        return 'New order received';
      case 'payment_order_failed':
        return 'Payment received but order failed';
      case 'messenger_100':
        return 'Messenger reply quota reached';
      case 'messenger_80':
        return '80% of Messenger replies used';
      default:
        return 'System notification';
    }
  }

  factory NotificationItemModel.fromJson(Map<String, dynamic> json) {
    return NotificationItemModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      kind: json['kind']?.toString() ?? 'general',
      title: json['title']?.toString(),
      message: json['message']?.toString() ?? json['desc']?.toString(),
      read: json['read'] == true,
      time: json['time'] != null || json['createdAt'] != null
          ? DateTime.tryParse(json['time']?.toString() ?? json['createdAt']?.toString() ?? '') ??
              DateTime.now()
          : DateTime.now(),
    );
  }
}
