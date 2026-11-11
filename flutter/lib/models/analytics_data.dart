class AnalyticsData {
  final double currentRevenue;
  final double previousRevenue;
  final int currentOrders;
  final int previousOrders;
  final int currentMessages;
  final int previousMessages;
  final int currentConversations;
  final int previousConversations;
  final List<DailyStat> timeline;

  AnalyticsData({
    this.currentRevenue = 0.0,
    this.previousRevenue = 0.0,
    this.currentOrders = 0,
    this.previousOrders = 0,
    this.currentMessages = 0,
    this.previousMessages = 0,
    this.currentConversations = 0,
    this.previousConversations = 0,
    this.timeline = const [],
  });

  double get revenueChangePercent {
    if (previousRevenue == 0) return currentRevenue > 0 ? 100 : 0;
    return ((currentRevenue - previousRevenue) / previousRevenue) * 100;
  }

  double get ordersChangePercent {
    if (previousOrders == 0) return currentOrders > 0 ? 100 : 0;
    return ((currentOrders - previousOrders) / previousOrders) * 100;
  }

  factory AnalyticsData.fromJson(Map<String, dynamic> json) {
    final comp = json['comparison'] as Map<String, dynamic>? ?? {};
    final totals = json['totals'] as Map<String, dynamic>? ?? {};

    final revMap = comp['revenue'] as Map<String, dynamic>? ?? {};
    final ordMap = comp['orders'] as Map<String, dynamic>? ?? {};
    final msgMap = comp['messages'] as Map<String, dynamic>? ?? {};
    final convMap = comp['conversations'] as Map<String, dynamic>? ?? {};

    List<DailyStat> points = [];
    if (json['timeline'] is List) {
      points = (json['timeline'] as List)
          .map((item) => DailyStat.fromJson(item as Map<String, dynamic>))
          .toList();
    }

    return AnalyticsData(
      currentRevenue: (revMap['current'] as num?)?.toDouble() ??
          (totals['revenue'] as num?)?.toDouble() ??
          0.0,
      previousRevenue: (revMap['previous'] as num?)?.toDouble() ?? 0.0,
      currentOrders: (ordMap['current'] as num?)?.toInt() ??
          (totals['orders'] as num?)?.toInt() ??
          0,
      previousOrders: (ordMap['previous'] as num?)?.toInt() ?? 0,
      currentMessages: (msgMap['current'] as num?)?.toInt() ??
          (totals['messages'] as num?)?.toInt() ??
          0,
      previousMessages: (msgMap['previous'] as num?)?.toInt() ?? 0,
      currentConversations: (convMap['current'] as num?)?.toInt() ??
          (totals['conversations'] as num?)?.toInt() ??
          0,
      previousConversations: (convMap['previous'] as num?)?.toInt() ?? 0,
      timeline: points,
    );
  }
}

class DailyStat {
  final String date;
  final double revenue;
  final int orders;

  DailyStat({
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
