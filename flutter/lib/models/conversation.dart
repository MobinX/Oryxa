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
  }) {
    return ConversationModel(
      id: id,
      customerName: customerName,
      lastMessageState: lastMessageState ?? this.lastMessageState,
      channelId: channelId,
      customerPlatformId: customerPlatformId,
      pageName: pageName,
      autoPilot: autoPilot ?? this.autoPilot,
      createdAt: createdAt,
      lastMessageText: lastMessageText,
    );
  }
}

class MessageModel {
  final String id;
  final String conversationId;
  final String from; // 'customer', 'self', 'agent'
  final String content;
  final String contentType; // 'text', 'cards', 'image'
  final String state;
  final DateTime time;

  MessageModel({
    required this.id,
    required this.conversationId,
    required this.from,
    required this.content,
    this.contentType = 'text',
    this.state = 'done',
    required this.time,
  });

  bool get isFromCustomer => from == 'customer';
  bool get isFromAgent => from == 'agent';
  bool get isFromSelf => from == 'self';

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id']?.toString() ?? '',
      conversationId: json['conversationId']?.toString() ?? '',
      from: json['from']?.toString() ?? 'customer',
      content: json['content']?.toString() ?? '',
      contentType: json['contentType']?.toString() ?? 'text',
      state: json['state']?.toString() ?? 'done',
      time: json['time'] != null
          ? DateTime.tryParse(json['time'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class InboxSuggestion {
  final String? title;
  final String content;
  final String type; // 'text', 'cards'

  InboxSuggestion({
    this.title,
    required this.content,
    this.type = 'text',
  });

  factory InboxSuggestion.fromJson(Map<String, dynamic> json) {
    return InboxSuggestion(
      title: json['title']?.toString(),
      content: json['content']?.toString() ?? '',
      type: json['type']?.toString() ?? 'text',
    );
  }
}
