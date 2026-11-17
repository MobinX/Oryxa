class AdminWindowMetrics {
  final int conversations;
  final int messages;
  final int inboundMessages;
  final int outboundMessages;
  final int orders;
  final double revenue;
  final int visits;
  final int llmTokens;
  final double estimatedCostUsd;
  final int agentRuns;

  const AdminWindowMetrics({
    required this.conversations,
    required this.messages,
    required this.inboundMessages,
    required this.outboundMessages,
    required this.orders,
    required this.revenue,
    required this.visits,
    required this.llmTokens,
    required this.estimatedCostUsd,
    required this.agentRuns,
  });

  factory AdminWindowMetrics.fromJson(Map<String, dynamic> json) {
    return AdminWindowMetrics(
      conversations: (json['conversations'] as num?)?.toInt() ?? 0,
      messages: (json['messages'] as num?)?.toInt() ?? 0,
      inboundMessages: (json['inboundMessages'] as num?)?.toInt() ?? 0,
      outboundMessages: (json['outboundMessages'] as num?)?.toInt() ?? 0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
      visits: (json['visits'] as num?)?.toInt() ?? 0,
      llmTokens: (json['llmTokens'] as num?)?.toInt() ?? 0,
      estimatedCostUsd: (json['estimatedCostUsd'] as num?)?.toDouble() ?? 0.0,
      agentRuns: (json['agentRuns'] as num?)?.toInt() ?? 0,
    );
  }
}

class AdminSnapshot {
  final int users;
  final int businesses;
  final int publishedStores;
  final int channels;
  final int products;

  const AdminSnapshot({
    required this.users,
    required this.businesses,
    required this.publishedStores,
    required this.channels,
    required this.products,
  });

  factory AdminSnapshot.fromJson(Map<String, dynamic> json) {
    return AdminSnapshot(
      users: (json['users'] as num?)?.toInt() ?? 0,
      businesses: (json['businesses'] as num?)?.toInt() ?? 0,
      publishedStores: (json['publishedStores'] as num?)?.toInt() ?? 0,
      channels: (json['channels'] as num?)?.toInt() ?? 0,
      products: (json['products'] as num?)?.toInt() ?? 0,
    );
  }
}

class AdminTopBusiness {
  final String id;
  final String name;
  final String? slug;
  final int conversations;
  final int messages;
  final int orders;
  final double revenue;

  const AdminTopBusiness({
    required this.id,
    required this.name,
    this.slug,
    required this.conversations,
    required this.messages,
    required this.orders,
    required this.revenue,
  });

  factory AdminTopBusiness.fromJson(Map<String, dynamic> json) {
    return AdminTopBusiness(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      slug: json['slug']?.toString(),
      conversations: (json['conversations'] as num?)?.toInt() ?? 0,
      messages: (json['messages'] as num?)?.toInt() ?? 0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class AdminDailyPoint {
  final String date;
  final int visits;
  final int conversations;
  final int messagesIn;
  final int messagesOut;
  final int orders;
  final double revenue;
  final int tokens;
  final double costUsd;

  const AdminDailyPoint({
    required this.date,
    required this.visits,
    required this.conversations,
    required this.messagesIn,
    required this.messagesOut,
    required this.orders,
    required this.revenue,
    required this.tokens,
    required this.costUsd,
  });

  factory AdminDailyPoint.fromJson(Map<String, dynamic> json) {
    return AdminDailyPoint(
      date: (json['date'] ?? '').toString(),
      visits: (json['visits'] as num?)?.toInt() ?? 0,
      conversations: (json['conversations'] as num?)?.toInt() ?? 0,
      messagesIn: (json['messagesIn'] as num?)?.toInt() ?? 0,
      messagesOut: (json['messagesOut'] as num?)?.toInt() ?? 0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
      tokens: (json['tokens'] as num?)?.toInt() ?? 0,
      costUsd: (json['costUsd'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class AdminStatsData {
  final int days;
  final String tz;
  final AdminSnapshot snapshot;
  final AdminWindowMetrics window;
  final AdminWindowMetrics previous;
  final List<AdminDailyPoint> daily;
  final List<AdminTopBusiness> topBusinesses;

  const AdminStatsData({
    required this.days,
    required this.tz,
    required this.snapshot,
    required this.window,
    required this.previous,
    required this.daily,
    required this.topBusinesses,
  });

  factory AdminStatsData.fromJson(Map<String, dynamic> json) {
    final range = json['range'] as Map<String, dynamic>? ?? {};
    final dailyList = <AdminDailyPoint>[];
    if (json['daily'] is List) {
      for (final p in json['daily'] as List) {
        if (p is Map<String, dynamic>) dailyList.add(AdminDailyPoint.fromJson(p));
      }
    }
    final topList = <AdminTopBusiness>[];
    if (json['topBusinesses'] is List) {
      for (final b in json['topBusinesses'] as List) {
        if (b is Map<String, dynamic>) topList.add(AdminTopBusiness.fromJson(b));
      }
    }

    return AdminStatsData(
      days: (range['days'] as num?)?.toInt() ?? 30,
      tz: (range['tz'] ?? 'UTC').toString(),
      snapshot: AdminSnapshot.fromJson(json['snapshot'] as Map<String, dynamic>? ?? {}),
      window: AdminWindowMetrics.fromJson(json['window'] as Map<String, dynamic>? ?? {}),
      previous: AdminWindowMetrics.fromJson(json['previous'] as Map<String, dynamic>? ?? {}),
      daily: dailyList,
      topBusinesses: topList,
    );
  }
}
