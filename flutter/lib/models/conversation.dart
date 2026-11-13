class ConversationModel {
  final String id;
  final String? customerName;
  final String lastMessageState;
  final String? channelId;
  final String? customerPlatformId;
  final String? pageName;
  final bool autoPilot;
  final DateTime? createdAt;
  final String? lastMessageText;

  ConversationModel({
    required this.id,
    this.customerName,
    required this.lastMessageState,
    this.channelId,
    this.customerPlatformId,
    this.pageName,
    this.autoPilot = true,
    this.createdAt,
    this.lastMessageText,
  });

  bool get isOpen =>
      lastMessageState == 'pending' || lastMessageState == 'working';
  bool get isResolved => lastMessageState == 'done';
  bool get isWorking => lastMessageState == 'working';

  String get displayName =>
      (customerName == null || customerName!.trim().isEmpty)
          ? 'Customer'
          : customerName!;

  /// Same rule as the web avatars: first letters of the first two words.
  String get initials {
    final parts = displayName.trim().split(RegExp(r'\s+'));
    return parts
        .take(2)
        .map((part) => part.isEmpty ? '' : part[0])
        .join()
        .toUpperCase();
  }

  String get statusLabel {
    if (isWorking) return 'AI is replying';
    if (isOpen) return 'Open conversation';
    return 'Resolved';
  }

  String get createdLabel {
    final at = createdAt;
    if (at == null) return '';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[at.month - 1]} ${at.day}';
  }

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    return ConversationModel(
      id: json['id']?.toString() ?? '',
      customerName: json['customerName']?.toString(),
      lastMessageState: json['lastMessageState']?.toString() ?? 'pending',
      channelId: json['channelId']?.toString(),
      customerPlatformId: json['customerPlatformId']?.toString(),
      pageName: json['pageName']?.toString(),
      autoPilot: json['autoPilot'] != false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      lastMessageText: json['lastMessageText']?.toString(),
    );
  }

  ConversationModel copyWith({
    bool? autoPilot,
    String? lastMessageState,
    String? pageName,
  }) {
    return ConversationModel(
      id: id,
      customerName: customerName,
      lastMessageState: lastMessageState ?? this.lastMessageState,
      channelId: channelId,
      customerPlatformId: customerPlatformId,
      pageName: pageName ?? this.pageName,
      autoPilot: autoPilot ?? this.autoPilot,
      createdAt: createdAt,
      lastMessageText: lastMessageText,
    );
  }
}

class MessageModel {
  final String id;
  final String conversationId;
  final String from; // 'customer', 'self'
  final String? sentBy; // 'ai', 'human' on self rows
  final String content;
  final String contentType; // 'text', 'cards', 'image'
  final String state;
  final List<String> images;
  final DateTime time;

  MessageModel({
    required this.id,
    required this.conversationId,
    required this.from,
    this.sentBy,
    required this.content,
    this.contentType = 'text',
    this.state = 'done',
    this.images = const [],
    required this.time,
  });

  bool get isFromCustomer => from == 'customer';
  bool get isFromAgent => from == 'agent' || (from == 'self' && sentBy == 'ai');
  bool get isFromHuman => from == 'self' && sentBy == 'human';
  bool get isFromSelf => from == 'self' || from == 'agent';

  String get timeLabel {
    final hour12 = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final minute = time.minute.toString().padLeft(2, '0');
    final suffix = time.hour < 12 ? 'AM' : 'PM';
    return '$hour12:$minute $suffix';
  }

  String get shortTimeLabel {
    final hour12 = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final minute = time.minute.toString().padLeft(2, '0');
    final suffix = time.hour < 12 ? 'AM' : 'PM';
    return '$hour12:$minute $suffix';
  }

  factory MessageModel.fromJson(Map<String, dynamic> json, {String? conversationId}) {
    return MessageModel(
      id: json['id']?.toString() ?? '',
      conversationId:
          json['conversationId']?.toString() ?? conversationId ?? '',
      from: json['from']?.toString() ?? 'customer',
      sentBy: json['sentBy']?.toString(),
      content: json['content']?.toString() ?? '',
      contentType: json['contentType']?.toString() ?? 'text',
      state: json['state']?.toString() ?? 'done',
      images: json['images'] is List
          ? (json['images'] as List).map((e) => e.toString()).toList()
          : const [],
      time: json['time'] != null
          ? DateTime.tryParse(json['time'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class SuggestionProduct {
  final String id;
  final String name;
  final double price;
  final String? imageUrl;

  SuggestionProduct({
    required this.id,
    required this.name,
    this.price = 0,
    this.imageUrl,
  });

  factory SuggestionProduct.fromJson(Map<String, dynamic> json) {
    return SuggestionProduct(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Product',
      price: (json['price'] as num?)?.toDouble() ??
          double.tryParse(json['price']?.toString() ?? '') ??
          0,
      imageUrl: json['imageUrl']?.toString(),
    );
  }
}

/// One row of the inbox suggestion panel — the rich discriminated union from
/// `packages/shared/schemas/conversation.ts`. Nothing here has been sent yet.
class InboxSuggestion {
  final String id;
  final String kind;
  final String? text;

  final String? productId;
  final String? variantId;
  final String? categoryId;
  final String? orderId;

  final String? title;
  final String? name;
  final String? subtitle;
  final String? variantName;

  final double price;
  final String? imageUrl;

  final int productCount;
  final int variantCount;
  final int photoCount;
  final int count;

  final String? customerPhone;
  final String? customerAddress;
  final String? state;
  final double? total;

  final List<SuggestionProduct> products;

  InboxSuggestion({
    required this.id,
    required this.kind,
    this.text,
    this.productId,
    this.variantId,
    this.categoryId,
    this.orderId,
    this.title,
    this.name,
    this.subtitle,
    this.variantName,
    this.price = 0,
    this.imageUrl,
    this.productCount = 0,
    this.variantCount = 0,
    this.photoCount = 0,
    this.count = 1,
    this.customerPhone,
    this.customerAddress,
    this.state,
    this.total,
    this.products = const [],
  });

  bool get isText => kind == 'text';

  String get displayTitle {
    if (kind == 'category') return name ?? 'Category';
    if (kind == 'text') return text ?? '';
    return title ?? name ?? 'Suggestion';
  }

  String get displaySubtitle {
    switch (kind) {
      case 'product':
        return subtitle ?? '৳${price.toStringAsFixed(0)}';
      case 'category':
        return '$productCount products';
      case 'product_info':
        return '$variantCount variants · ৳${price.toStringAsFixed(0)}';
      case 'variant':
        return '${variantName ?? 'Variant'} · $photoCount photos · ৳${price.toStringAsFixed(0)}';
      case 'order':
        return 'Make an order · ৳${price.toStringAsFixed(0)}';
      case 'order_card':
        return subtitle ?? '';
      default:
        return '';
    }
  }

  String get actionLabel {
    switch (kind) {
      case 'product':
        return 'Send product card';
      case 'category':
        return 'Send category';
      case 'product_info':
        return 'Send variant cards';
      case 'variant':
        return 'Send photos';
      case 'order':
        return 'Make order';
      case 'order_card':
        return 'Send order card';
      default:
        return 'Use this reply';
    }
  }

  String? get displayImage => kind == 'category' ? null : imageUrl;

  /// What to POST to `/suggestions/send`. Null for a text draft, which is used in the
  /// composer instead of being sent.
  Map<String, dynamic>? toSendPayload() {
    switch (kind) {
      case 'product':
        return {'kind': 'product', 'productId': productId};
      case 'category':
        return {'kind': 'category', 'categoryId': categoryId};
      case 'product_info':
        return {'kind': 'product_info', 'productId': productId};
      case 'variant':
        return {
          'kind': 'product_variant',
          'productId': productId,
          'variantId': variantId,
        };
      case 'order_card':
        return {'kind': 'order_card', 'orderId': orderId};
      default:
        return null;
    }
  }

  factory InboxSuggestion.fromJson(Map<String, dynamic> json) {
    double asDouble(dynamic value) {
      if (value is num) return value.toDouble();
      return double.tryParse(value?.toString() ?? '') ?? 0;
    }

    int asInt(dynamic value) {
      if (value is num) return value.toInt();
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return InboxSuggestion(
      id: json['id']?.toString() ?? '',
      kind: json['kind']?.toString() ?? 'text',
      text: json['text']?.toString(),
      productId: json['productId']?.toString(),
      variantId: json['variantId']?.toString(),
      categoryId: json['categoryId']?.toString(),
      orderId: json['orderId']?.toString(),
      title: json['title']?.toString(),
      name: json['name']?.toString(),
      subtitle: json['subtitle']?.toString(),
      variantName: json['variantName']?.toString(),
      price: asDouble(json['price']),
      imageUrl: json['imageUrl']?.toString(),
      productCount: asInt(json['productCount']),
      variantCount: asInt(json['variantCount']),
      photoCount: asInt(json['photoCount']),
      count: asInt(json['count']) > 0 ? asInt(json['count']) : 1,
      customerPhone: json['customerPhone']?.toString(),
      customerAddress: json['customerAddress']?.toString(),
      state: json['state']?.toString(),
      total: json['total'] == null ? null : asDouble(json['total']),
      products: json['products'] is List
          ? (json['products'] as List)
              .whereType<Map>()
              .map((p) => SuggestionProduct.fromJson(Map<String, dynamic>.from(p)))
              .toList()
          : const [],
    );
  }
}

/// `GET /conversations/{id}/order-defaults` — what the API already knows about the
/// customer, so the order form does not make the merchant retype it.
class ConversationOrderDefaults {
  final int count;
  final String customerPhone;
  final String customerAddress;

  ConversationOrderDefaults({
    this.count = 1,
    this.customerPhone = '',
    this.customerAddress = '',
  });

  factory ConversationOrderDefaults.fromJson(Map<String, dynamic> json) {
    return ConversationOrderDefaults(
      count: (json['count'] as num?)?.toInt() ?? 1,
      customerPhone: json['customerPhone']?.toString() ?? '',
      customerAddress: json['customerAddress']?.toString() ?? '',
    );
  }
}
