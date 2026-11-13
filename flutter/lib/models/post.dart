import 'dart:convert';

class PostSyncModel {
  final int likeCount;
  final int commentCount;
  final int shareCount;
  final int reachCount;
  final DateTime syncedAt;

  PostSyncModel({
    required this.likeCount,
    required this.commentCount,
    required this.shareCount,
    required this.reachCount,
    required this.syncedAt,
  });

  factory PostSyncModel.fromJson(Map<String, dynamic> json) {
    return PostSyncModel(
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      shareCount: (json['shareCount'] as num?)?.toInt() ?? 0,
      reachCount: (json['reachCount'] as num?)?.toInt() ?? 0,
      syncedAt: json['syncedAt'] != null
          ? DateTime.tryParse(json['syncedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'likeCount': likeCount,
        'commentCount': commentCount,
        'shareCount': shareCount,
        'reachCount': reachCount,
        'syncedAt': syncedAt.toIso8601String(),
      };
}

class PostModel {
  final String id;
  final String channelId;
  final String? productId;
  final String content;
  final List<String> mediaUrls;
  final String postState; // 'draft', 'scheduled', 'published', 'failed'
  final String? platformPostId;
  final DateTime? scheduledAt;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final int? likeCount;
  final int? commentCount;
  final int? shareCount;
  final int? reachCount;
  final String? aiPrompt;
  final PostSyncModel? latestSync;

  PostModel({
    required this.id,
    required this.channelId,
    this.productId,
    required this.content,
    this.mediaUrls = const [],
    this.postState = 'draft',
    this.platformPostId,
    this.scheduledAt,
    this.publishedAt,
    required this.createdAt,
    this.likeCount,
    this.commentCount,
    this.shareCount,
    this.reachCount,
    this.aiPrompt,
    this.latestSync,
  });

  bool get isPublished => postState == 'published';
  bool get isScheduled => postState == 'scheduled';
  bool get isDraft => postState == 'draft';
  bool get isFailed => postState == 'failed';

  factory PostModel.fromJson(Map<String, dynamic> json) {
    List<String> urls = [];
    if (json['mediaUrls'] is List) {
      urls = (json['mediaUrls'] as List).map((e) => e.toString()).toList();
    } else if (json['mediaUrls'] is String) {
      try {
        final decoded = jsonDecode(json['mediaUrls'] as String);
        if (decoded is List) {
          urls = decoded.map((e) => e.toString()).toList();
        }
      } catch (_) {}
    }

    PostSyncModel? sync;
    if (json['latestSync'] is Map) {
      sync = PostSyncModel.fromJson(Map<String, dynamic>.from(json['latestSync']));
    }

    return PostModel(
      id: json['id']?.toString() ?? '',
      channelId: json['channelId']?.toString() ?? '',
      productId: json['productId']?.toString(),
      content: json['content']?.toString() ?? '',
      mediaUrls: urls,
      postState: json['postState']?.toString() ?? 'draft',
      platformPostId: json['platformPostId']?.toString(),
      scheduledAt: json['scheduledAt'] != null
          ? DateTime.tryParse(json['scheduledAt'].toString())
          : null,
      publishedAt: json['publishedAt'] != null
          ? DateTime.tryParse(json['publishedAt'].toString())
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      likeCount: (json['likeCount'] as num?)?.toInt(),
      commentCount: (json['commentCount'] as num?)?.toInt(),
      shareCount: (json['shareCount'] as num?)?.toInt(),
      reachCount: (json['reachCount'] as num?)?.toInt(),
      aiPrompt: json['aiPrompt']?.toString(),
      latestSync: sync,
    );
  }

  PostModel copyWith({
    String? id,
    String? channelId,
    String? productId,
    String? content,
    List<String>? mediaUrls,
    String? postState,
    String? platformPostId,
    DateTime? scheduledAt,
    DateTime? publishedAt,
    DateTime? createdAt,
    int? likeCount,
    int? commentCount,
    int? shareCount,
    int? reachCount,
    String? aiPrompt,
    PostSyncModel? latestSync,
  }) {
    return PostModel(
      id: id ?? this.id,
      channelId: channelId ?? this.channelId,
      productId: productId ?? this.productId,
      content: content ?? this.content,
      mediaUrls: mediaUrls ?? this.mediaUrls,
      postState: postState ?? this.postState,
      platformPostId: platformPostId ?? this.platformPostId,
      scheduledAt: scheduledAt ?? this.scheduledAt,
      publishedAt: publishedAt ?? this.publishedAt,
      createdAt: createdAt ?? this.createdAt,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      shareCount: shareCount ?? this.shareCount,
      reachCount: reachCount ?? this.reachCount,
      aiPrompt: aiPrompt ?? this.aiPrompt,
      latestSync: latestSync ?? this.latestSync,
    );
  }
}

class LiveCommentModel {
  final String? externalId;
  final String content;
  final DateTime time;
  final String from; // 'customer' | 'self'
  int likeCount;
  bool userLikes;

  LiveCommentModel({
    this.externalId,
    required this.content,
    required this.time,
    required this.from,
    this.likeCount = 0,
    this.userLikes = false,
  });

  factory LiveCommentModel.fromJson(Map<String, dynamic> json) {
    return LiveCommentModel(
      externalId: json['externalId']?.toString(),
      content: json['content']?.toString() ?? '',
      time: json['time'] != null
          ? DateTime.tryParse(json['time'].toString()) ?? DateTime.now()
          : DateTime.now(),
      from: json['from']?.toString() ?? 'customer',
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      userLikes: json['userLikes'] == true,
    );
  }
}

class LiveCommentReplyModel {
  final String id;
  final String? externalId;
  final String content;
  final DateTime time;
  final String from; // 'self' | 'customer'
  final String? commenterPlatformId;
  final String? commenterName;
  int likeCount;
  bool userLikes;

  LiveCommentReplyModel({
    required this.id,
    this.externalId,
    required this.content,
    required this.time,
    required this.from,
    this.commenterPlatformId,
    this.commenterName,
    this.likeCount = 0,
    this.userLikes = false,
  });

  factory LiveCommentReplyModel.fromJson(Map<String, dynamic> json) {
    return LiveCommentReplyModel(
      id: json['id']?.toString() ?? '',
      externalId: json['externalId']?.toString(),
      content: json['content']?.toString() ?? '',
      time: json['time'] != null
          ? DateTime.tryParse(json['time'].toString()) ?? DateTime.now()
          : DateTime.now(),
      from: json['from']?.toString() ?? 'self',
      commenterPlatformId: json['commenterPlatformId']?.toString(),
      commenterName: json['commenterName']?.toString(),
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      userLikes: json['userLikes'] == true,
    );
  }
}

class LiveCommentThreadModel {
  final String id;
  final String? commenterPlatformId;
  final String? commenterName;
  final String? commenterAvatar;
  final LiveCommentModel comment;
  final List<LiveCommentReplyModel> replies;

  LiveCommentThreadModel({
    required this.id,
    this.commenterPlatformId,
    this.commenterName,
    this.commenterAvatar,
    required this.comment,
    this.replies = const [],
  });

  factory LiveCommentThreadModel.fromJson(Map<String, dynamic> json) {
    final rawComment = json['comment'] is Map
        ? Map<String, dynamic>.from(json['comment'])
        : <String, dynamic>{};

    final reps = <LiveCommentReplyModel>[];
    if (json['replies'] is List) {
      for (final r in json['replies'] as List) {
        if (r is Map) {
          reps.add(LiveCommentReplyModel.fromJson(Map<String, dynamic>.from(r)));
        }
      }
    }

    return LiveCommentThreadModel(
      id: json['id']?.toString() ?? '',
      commenterPlatformId: json['commenterPlatformId']?.toString(),
      commenterName: json['commenterName']?.toString(),
      commenterAvatar: json['commenterAvatar']?.toString(),
      comment: LiveCommentModel.fromJson(rawComment),
      replies: reps,
    );
  }
}
