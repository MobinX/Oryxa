class AdminFormat {
  /// Numbers the way an operator reads them: grouped with commas, never a raw float.
  static String whole(num? value) {
    if (value == null || !value.isFinite) return '0';
    final parts = value.toInt().toString();
    return parts.replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]},',
    );
  }

  /// Compact token counts: 1.2M, 45k, 1.5k, etc.
  static String compact(num? value) {
    if (value == null || !value.isFinite) return '0';
    final v = value.toDouble();
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 10000) return '${(v / 1000).toStringAsFixed(0)}k';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}k';
    return whole(value);
  }

  /// Standard currency formatting.
  static String money(num? value) {
    if (value == null || !value.isFinite) return '\$0.00';
    final v = value.toDouble();
    return '\$${v.toStringAsFixed(v >= 1000 ? 0 : 2)}';
  }

  /// Token bills are often fractions of a cent; two decimals would hide the whole cost.
  /// Exactly clones `apps/web/lib/format.ts:tokenMoney`.
  static String tokenMoney(num? value) {
    if (value == null || !value.isFinite || value == 0) return '\$0.00';
    final v = value.toDouble();
    if (v < 0.01) return '\$${v.toStringAsFixed(6)}';
    if (v < 1) return '\$${v.toStringAsFixed(4)}';
    return money(v);
  }

  /// "Nov 2026", UTC month representation.
  static String monthLabel(String key) {
    final parts = key.split('-');
    if (parts.length != 2) return key;
    final year = int.tryParse(parts[0]) ?? 2026;
    final month = int.tryParse(parts[1]) ?? 1;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    if (month >= 1 && month <= 12) {
      return '${months[month - 1]} $year';
    }
    return key;
  }

  /// Current calendar month in UTC (YYYY-MM).
  static String currentMonth([DateTime? now]) {
    final dt = (now ?? DateTime.now()).toUtc();
    final monthStr = dt.month.toString().padLeft(2, '0');
    return '${dt.year}-$monthStr';
  }

  /// Recent UTC months, newest first (e.g. 4 months).
  static List<String> recentMonths([int count = 4, DateTime? now]) {
    final dt = (now ?? DateTime.now()).toUtc();
    return List.generate(count, (index) {
      final at = DateTime.utc(dt.year, dt.month - index, 1);
      final monthStr = at.month.toString().padLeft(2, '0');
      return '${at.year}-$monthStr';
    });
  }

  /// Validate or fallback to current month.
  static String readMonth(String? value, [DateTime? now]) {
    if (value != null && RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(value)) {
      return value;
    }
    return currentMonth(now);
  }
}
