class AgentModel {
  final String id;
  final String name;
  final String platformType;
  final String? systemPrompt;
  final String? replyGuidance;
  final String? commentReplyGuidance;
  final bool followsDefault;
  final String? defaultReplyGuidance;
  final String? defaultCommentReplyGuidance;

  AgentModel({
    required this.id,
    required this.name,
    this.platformType = 'facebook',
    this.systemPrompt,
    this.replyGuidance,
    this.commentReplyGuidance,
    this.followsDefault = true,
    this.defaultReplyGuidance,
    this.defaultCommentReplyGuidance,
  });

  factory AgentModel.fromJson(Map<String, dynamic> json) {
    final guidance = json['guidanceDefaults'] as Map<String, dynamic>?;
    return AgentModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Default Agent',
      platformType: json['platformType']?.toString() ?? 'facebook',
      systemPrompt: json['systemPrompt']?.toString(),
      replyGuidance: json['replyGuidance']?.toString(),
      commentReplyGuidance: json['commentReplyGuidance']?.toString(),
      followsDefault: json['followsDefault'] != false,
      defaultReplyGuidance: guidance?['replyGuidance']?.toString(),
      defaultCommentReplyGuidance:
          guidance?['commentReplyGuidance']?.toString(),
    );
  }

  AgentModel copyWith({
    String? systemPrompt,
    String? replyGuidance,
    String? commentReplyGuidance,
    bool? followsDefault,
  }) {
    return AgentModel(
      id: id,
      name: name,
      platformType: platformType,
      systemPrompt: systemPrompt ?? this.systemPrompt,
      replyGuidance: replyGuidance ?? this.replyGuidance,
      commentReplyGuidance:
          commentReplyGuidance ?? this.commentReplyGuidance,
      followsDefault: followsDefault ?? this.followsDefault,
      defaultReplyGuidance: defaultReplyGuidance,
      defaultCommentReplyGuidance: defaultCommentReplyGuidance,
    );
  }
}

class PlaygroundLogEvent {
  final String id;
  final String event;
  final String timestamp;
  final dynamic data;

  PlaygroundLogEvent({
    required this.id,
    required this.event,
    required this.timestamp,
    required this.data,
  });
}

class PlaygroundTraceToolCall {
  final String id;
  final String name;
  final dynamic args;

  PlaygroundTraceToolCall({
    required this.id,
    required this.name,
    this.args,
  });
}

class PlaygroundTraceUsage {
  final int inputTokens;
  final int outputTokens;
  final int totalTokens;
  final int cacheReadTokens;
  final int reasoningTokens;

  PlaygroundTraceUsage({
    this.inputTokens = 0,
    this.outputTokens = 0,
    this.totalTokens = 0,
    this.cacheReadTokens = 0,
    this.reasoningTokens = 0,
  });

  factory PlaygroundTraceUsage.fromJson(Map<String, dynamic> json) {
    return PlaygroundTraceUsage(
      inputTokens: (json['inputTokens'] as num?)?.toInt() ?? 0,
      outputTokens: (json['outputTokens'] as num?)?.toInt() ?? 0,
      totalTokens: (json['totalTokens'] as num?)?.toInt() ?? 0,
      cacheReadTokens: (json['cacheReadTokens'] as num?)?.toInt() ?? 0,
      reasoningTokens: (json['reasoningTokens'] as num?)?.toInt() ?? 0,
    );
  }
}

class PlaygroundTraceMessage {
  final String role; // 'system', 'user', 'ai', 'tool'
  final String content;
  final List<PlaygroundTraceToolCall> toolCalls;
  final String? toolName;
  final PlaygroundTraceUsage? usage;

  PlaygroundTraceMessage({
    required this.role,
    required this.content,
    this.toolCalls = const [],
    this.toolName,
    this.usage,
  });

  factory PlaygroundTraceMessage.fromJson(Map<String, dynamic> json) {
    final calls = <PlaygroundTraceToolCall>[];
    if (json['toolCalls'] is List) {
      for (final tc in json['toolCalls']) {
        if (tc is Map) {
          calls.add(PlaygroundTraceToolCall(
            id: tc['id']?.toString() ?? '',
            name: tc['name']?.toString() ?? '',
            args: tc['args'],
          ));
        }
      }
    }
    return PlaygroundTraceMessage(
      role: json['role']?.toString() ?? 'system',
      content: json['content']?.toString() ?? '',
      toolCalls: calls,
      toolName: json['toolName']?.toString(),
      usage: json['usage'] is Map
          ? PlaygroundTraceUsage.fromJson(
              Map<String, dynamic>.from(json['usage']))
          : null,
    );
  }
}

class CommentThreadItem {
  final String id;
  final String from; // 'customer' | 'self'
  final String content;
  final String kind; // 'comment' | 'reply' | 'dm'
  final DateTime time;

  CommentThreadItem({
    required this.id,
    required this.from,
    required this.content,
    required this.kind,
    required this.time,
  });
}
