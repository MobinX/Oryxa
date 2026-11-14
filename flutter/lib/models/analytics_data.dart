enum DeltaTone { up, down, flat }

class Delta {
  final String text;
  final DeltaTone tone;

  const Delta({required this.text, required this.tone});

  static Delta? of(num current, num previous) {
    if (current == 0 && previous == 0) return null;
    if (previous == 0) return const Delta(text: 'new', tone: DeltaTone.up);
    final percent = ((current - previous) / previous) * 100;
    if (percent.abs() < 0.5) return const Delta(text: 'flat', tone: DeltaTone.flat);
    final rounded = percent.abs() >= 100 ? percent.round() : (percent * 10).round() / 10;
    return Delta(
      text: '${percent > 0 ? '↑' : '↓'}${rounded.abs()}%',
      tone: percent > 0 ? DeltaTone.up : DeltaTone.down,
    );
  }
}

class ComparisonMetric {
  final num current;
  final num previous;
  final Delta? delta;

  ComparisonMetric({
    this.current = 0,
    this.previous = 0,
  }) : delta = Delta.of(current, previous);

  factory ComparisonMetric.fromJson(Map<String, dynamic>? json) {
    if (json == null) return ComparisonMetric();
    return ComparisonMetric(
      current: json['current'] as num? ?? 0,
      previous: json['previous'] as num? ?? 0,
    );
  }
}

class DailyActivityPoint {
  final String date;
  final int messages;
  final int orders;
  final double revenue;

  const DailyActivityPoint({
    required this.date,
    this.messages = 0,
    this.orders = 0,
    this.revenue = 0.0,
  });

  String get shortDate {
    if (date.length >= 10) {
      final parts = date.split('-');
      if (parts.length == 3) {
        final m = int.tryParse(parts[1]) ?? 1;
        final d = int.tryParse(parts[2]) ?? 1;
        const months = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];
        return '${months[m - 1]} $d';
      }
    }
    return date;
  }
}

class OrderStateBreakdown {
  final String state;
  final int count;
  final double revenue;

  const OrderStateBreakdown({
    required this.state,
    this.count = 0,
    this.revenue = 0.0,
  });

  factory OrderStateBreakdown.fromJson(Map<String, dynamic> json) {
    return OrderStateBreakdown(
      state: json['state']?.toString() ?? 'unknown',
      count: (json['count'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class LifetimeTotals {
  final int products;
  final int orders;
  final int channels;
  final int conversations;
  final double revenue;
  final int messages;
  final double avgResponseTime;

  const LifetimeTotals({
    this.products = 0,
    this.orders = 0,
    this.channels = 0,
    this.conversations = 0,
    this.revenue = 0.0,
    this.messages = 0,
    this.avgResponseTime = 0.0,
  });

  factory LifetimeTotals.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const LifetimeTotals();
    return LifetimeTotals(
      products: (json['products'] as num?)?.toInt() ?? 0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
      channels: (json['channels'] as num?)?.toInt() ?? 0,
      conversations: (json['conversations'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
      messages: (json['messages'] as num?)?.toInt() ?? 0,
      avgResponseTime: (json['avgResponseTime'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class QuotaOverview {
  final bool assigned;
  final String planName;
  final int? messageLimit;
  final int messagesUsed;
  final int? commentLimit;
  final int commentsUsed;
  final bool messageBlocked;
  final int daysLeft;

  const QuotaOverview({
    this.assigned = false,
    this.planName = 'No plan — unlimited',
    this.messageLimit,
    this.messagesUsed = 0,
    this.commentLimit,
    this.commentsUsed = 0,
    this.messageBlocked = false,
    this.daysLeft = 30,
  });

  factory QuotaOverview.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const QuotaOverview();
    final cycle = json['cycle'] as Map<String, dynamic>? ?? {};
    return QuotaOverview(
      assigned: json['assigned'] as bool? ?? false,
      planName: json['planName']?.toString() ?? 'No plan — unlimited',
      messageLimit: (json['messageLimit'] as num?)?.toInt(),
      messagesUsed: (json['messagesUsed'] as num?)?.toInt() ?? 0,
      commentLimit: (json['commentLimit'] as num?)?.toInt(),
      commentsUsed: (json['commentsUsed'] as num?)?.toInt() ?? 0,
      messageBlocked: json['messageBlocked'] as bool? ?? false,
      daysLeft: (cycle['daysLeft'] as num?)?.toInt() ?? 30,
    );
  }

  int? get messagesRemaining =>
      messageLimit == null ? null : (messageLimit! - messagesUsed).clamp(0, 999999999);
}

class TokenAnalyticsTotals {
  final int totalTokens;
  final int totalRuns;
  final double cacheHitPercent;
  final int avgTokensPerMessage;
  final double totalEstimatedCostUsd;

  const TokenAnalyticsTotals({
    this.totalTokens = 0,
    this.totalRuns = 0,
    this.cacheHitPercent = 0.0,
    this.avgTokensPerMessage = 0,
    this.totalEstimatedCostUsd = 0.0,
  });

  factory TokenAnalyticsTotals.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const TokenAnalyticsTotals();
    final totals = json['totals'] as Map<String, dynamic>? ?? json;
    return TokenAnalyticsTotals(
      totalTokens: (totals['totalTokens'] as num?)?.toInt() ?? 0,
      totalRuns: (totals['totalRuns'] as num?)?.toInt() ?? 0,
      cacheHitPercent: (totals['overallCacheHitPercent'] as num?)?.toDouble() ?? 0.0,
      avgTokensPerMessage: (totals['avgTokensPerMessage'] as num?)?.toInt() ?? 0,
      totalEstimatedCostUsd: (totals['totalEstimatedCostUsd'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class AnalyticsData {
  final ComparisonMetric messages;
  final ComparisonMetric conversations;
  final ComparisonMetric orders;
  final ComparisonMetric revenue;
  final List<DailyActivityPoint> dailySeries;
  final List<OrderStateBreakdown> ordersByState;
  final LifetimeTotals totals;
  final QuotaOverview? quota;
  final TokenAnalyticsTotals? tokenTotals;

  AnalyticsData({
    required this.messages,
    required this.conversations,
    required this.orders,
    required this.revenue,
    this.dailySeries = const [],
    this.ordersByState = const [],
    required this.totals,
    this.quota,
    this.tokenTotals,
  });

  double get currentRevenue => revenue.current.toDouble();
  double get previousRevenue => revenue.previous.toDouble();
  int get currentOrders => orders.current.toInt();
  int get previousOrders => orders.previous.toInt();
  int get currentMessages => messages.current.toInt();
  int get previousMessages => messages.previous.toInt();
  int get currentConversations => conversations.current.toInt();
  int get previousConversations => conversations.previous.toInt();

  double get revenueChangePercent {
    if (previousRevenue == 0) return currentRevenue > 0 ? 100 : 0;
    return ((currentRevenue - previousRevenue) / previousRevenue) * 100;
  }

  double get ordersChangePercent {
    if (previousOrders == 0) return currentOrders > 0 ? 100 : 0;
    return ((currentOrders - previousOrders) / previousOrders) * 100;
  }

  double get windowRevenue {
    return dailySeries.fold(0.0, (sum, day) => sum + day.revenue);
  }

  int get maxDailyActivity {
    int maxVal = 1;
    for (final day in dailySeries) {
      if (day.messages > maxVal) maxVal = day.messages;
      if (day.orders > maxVal) maxVal = day.orders;
    }
    return maxVal;
  }

  bool get hasActivity {
    return dailySeries.any((d) => d.messages > 0 || d.orders > 0);
  }

  List<DailyStat> get timeline => dailySeries
      .map((d) => DailyStat(date: d.date, revenue: d.revenue, orders: d.orders))
      .toList();

  factory AnalyticsData.fromJson(
    Map<String, dynamic> json, {
    Map<String, dynamic>? billingJson,
    Map<String, dynamic>? tokenAnalyticsJson,
  }) {
    final comp = json['comparison'] as Map<String, dynamic>? ?? {};
    final totalsMap = json['totals'] as Map<String, dynamic>? ?? {};

    // Comparison metrics
    final msgMetric = ComparisonMetric.fromJson(comp['messages'] as Map<String, dynamic>?);
    final convMetric = ComparisonMetric.fromJson(comp['conversations'] as Map<String, dynamic>?);
    final ordMetric = ComparisonMetric.fromJson(comp['orders'] as Map<String, dynamic>?);
    final revMetric = ComparisonMetric.fromJson(comp['revenue'] as Map<String, dynamic>?);

    // Build map of daily orders keyed by date
    final dailyOrdersRaw = json['dailyOrders'] as List? ?? [];
    final Map<String, Map<String, dynamic>> ordersByDate = {};
    for (final item in dailyOrdersRaw) {
      if (item is Map<String, dynamic>) {
        final d = item['date']?.toString();
        if (d != null) ordersByDate[d] = item;
      }
    }

    // Build unified daily series from dailyMessages
    final dailyMessagesRaw = json['dailyMessages'] as List? ?? [];
    final List<DailyActivityPoint> series = [];

    for (final item in dailyMessagesRaw) {
      if (item is Map<String, dynamic>) {
        final date = item['date']?.toString() ?? '';
        final msgCount = (item['count'] as num?)?.toInt() ?? 0;
        final orderEntry = ordersByDate[date];
        final orderCount = (orderEntry?['count'] as num?)?.toInt() ?? 0;
        final orderRevenue = (orderEntry?['revenue'] as num?)?.toDouble() ?? 0.0;

        series.add(DailyActivityPoint(
          date: date,
          messages: msgCount,
          orders: orderCount,
          revenue: orderRevenue,
        ));
      }
    }

    // If dailyMessages was empty but dailyOrders had data, fill from dailyOrders
    if (series.isEmpty && dailyOrdersRaw.isNotEmpty) {
      for (final item in dailyOrdersRaw) {
        if (item is Map<String, dynamic>) {
          series.add(DailyActivityPoint(
            date: item['date']?.toString() ?? '',
            messages: 0,
            orders: (item['count'] as num?)?.toInt() ?? 0,
            revenue: (item['revenue'] as num?)?.toDouble() ?? 0.0,
          ));
        }
      }
    }

    // Orders by state
    final ordersByStateRaw = json['ordersByState'] as List? ?? [];
    final List<OrderStateBreakdown> stateBreakdown = ordersByStateRaw
        .whereType<Map<String, dynamic>>()
        .map((s) => OrderStateBreakdown.fromJson(s))
        .toList();

    // Lifetime totals
    final totals = LifetimeTotals.fromJson(totalsMap);

    // Optional Quota from billing
    QuotaOverview? quota;
    if (billingJson != null && billingJson['quota'] is Map<String, dynamic>) {
      quota = QuotaOverview.fromJson(billingJson['quota'] as Map<String, dynamic>);
    }

    // Optional Token totals
    TokenAnalyticsTotals? tokenTotals;
    if (tokenAnalyticsJson != null) {
      tokenTotals = TokenAnalyticsTotals.fromJson(tokenAnalyticsJson);
    }

    return AnalyticsData(
      messages: msgMetric,
      conversations: convMetric,
      orders: ordMetric,
      revenue: revMetric,
      dailySeries: series,
      ordersByState: stateBreakdown,
      totals: totals,
      quota: quota,
      tokenTotals: tokenTotals,
    );
  }

  factory AnalyticsData.mock() {
    return AnalyticsData(
      messages: ComparisonMetric(current: 312, previous: 195),
      conversations: ComparisonMetric(current: 84, previous: 62),
      orders: ComparisonMetric(current: 38, previous: 27),
      revenue: ComparisonMetric(current: 24500, previous: 18200),
      dailySeries: List.generate(7, (i) {
        final d = DateTime.now().subtract(Duration(days: 6 - i));
        final dateStr =
            '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        return DailyActivityPoint(
          date: dateStr,
          messages: [12, 19, 15, 27, 22, 35, 41][i],
          orders: [2, 4, 3, 6, 5, 8, 10][i],
          revenue: [1500, 3200, 2100, 4800, 3900, 6400, 8100][i].toDouble(),
        );
      }),
      ordersByState: const [
        OrderStateBreakdown(state: 'pending', count: 4, revenue: 3200),
        OrderStateBreakdown(state: 'confirmed', count: 12, revenue: 9800),
        OrderStateBreakdown(state: 'shipped', count: 8, revenue: 6400),
        OrderStateBreakdown(state: 'delivered', count: 14, revenue: 11500),
      ],
      totals: const LifetimeTotals(
        products: 48,
        channels: 3,
        conversations: 420,
        messages: 1840,
        orders: 156,
        revenue: 142000,
        avgResponseTime: 1.8,
      ),
    );
  }
}

class DailyStat {
  final String date;
  final double revenue;
  final int orders;

  const DailyStat({
    required this.date,
    required this.revenue,
    required this.orders,
  });

  factory DailyStat.fromJson(Map<String, dynamic> json) {
    return DailyStat(
      date: json['date']?.toString() ?? '',
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
    );
  }
}
