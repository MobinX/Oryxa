/// The order shape the API returns, plus the web dashboard's state rules.
///
/// `apps/web/lib/order-state.ts` is the reference: the four canonical states, the labels the
/// merchant sees and the transitions the API accepts. The app used to allow `done -> onDelivery`,
/// which the API rejects with a 409, so the buttons have to use the same table as the web.
class OrderModel {
  final String id;
  final String businessId;
  final String? customerId;
  final String customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? customerAddress;
  final String? productId;
  final String? productName;
  final String? variantId;
  final String? variantName;
  final String? variantShortId;
  final String? variantImageUrl;
  final int count;
  final double unitPrice;
  final double shippingCost;
  final double totalPrice;
  final String currency;
  final String state;
  final String? paymentMethod;
  final String? transactionId;
  final String? paymentStrategy;
  final String? conversationId;
  final DateTime? createdAt;

  OrderModel({
    required this.id,
    required this.businessId,
    this.customerId,
    required this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.customerAddress,
    this.productId,
    this.productName,
    this.variantId,
    this.variantName,
    this.variantShortId,
    this.variantImageUrl,
    this.count = 1,
    this.unitPrice = 0.0,
    this.shippingCost = 0.0,
    this.totalPrice = 0.0,
    this.currency = 'BDT',
    this.state = 'pending',
    this.paymentMethod,
    this.transactionId,
    this.paymentStrategy,
    this.conversationId,
    this.createdAt,
  });

  /// Canonical states, exactly as the API stores them (camelCase `onDelivery`).
  static const List<String> states = [
    'pending',
    'acknowledged',
    'onDelivery',
    'done',
  ];

  /// Kept for older screens that iterate the selectable values.
  static const List<String> validStates = states;

  /// Accepts any casing ('ondelivery', 'ON_DELIVERY', 'On delivery') and returns the
  /// canonical state, the same normalisation the web dashboard applies.
  static String normalizeState(dynamic raw) {
    final key = (raw?.toString() ?? '').toLowerCase().replaceAll(RegExp(r'[\s_-]'), '');
    for (final state in states) {
      if (state.toLowerCase() == key) return state;
    }
    return 'pending';
  }

  static String stateLabel(String state) {
    switch (normalizeState(state)) {
      case 'acknowledged':
        return 'Confirmed';
      case 'onDelivery':
        return 'On Delivery';
      case 'done':
        return 'Delivered';
      default:
        return 'Pending';
    }
  }

  static String stateTitle(String state) {
    switch (normalizeState(state)) {
      case 'pending':
        return 'Order Placed';
      case 'acknowledged':
        return 'Order Confirmed';
      case 'onDelivery':
        return 'Handed to Courier';
      case 'done':
        return 'Delivered & Completed';
      default:
        return state;
    }
  }

  static const Map<String, List<String>> allowedTransitions = {
    'pending': ['acknowledged', 'onDelivery', 'done'],
    'acknowledged': ['onDelivery', 'pending'],
    'onDelivery': ['done', 'acknowledged'],
    'done': <String>[],
  };

  static bool canTransition(String from, String to) {
    final f = normalizeState(from);
    final t = normalizeState(to);
    if (f == t) return false;
    return allowedTransitions[f]?.contains(t) ?? false;
  }

  static String? nextOrderState(String state) {
    final i = states.indexOf(normalizeState(state));
    return i >= 0 && i < states.length - 1 ? states[i + 1] : null;
  }

  /// `done` is final: the API refuses to move a delivered order back.
  static String? prevOrderState(String state) {
    final normalized = normalizeState(state);
    if (normalized == 'done') return null;
    final i = states.indexOf(normalized);
    return i > 0 ? states[i - 1] : null;
  }

  /// Web `formatTaka`: whole Taka for BDT, ISO code for every other currency.
  static String formatMoney(dynamic value, [String? currency]) {
    double n = 0;
    if (value is num) {
      n = value.toDouble();
    } else {
      n = double.tryParse(value?.toString() ?? '') ?? 0;
    }
    final code = (currency == null || currency.isEmpty) ? 'BDT' : currency.toUpperCase();
    if (code == 'BDT') return '৳${n.toStringAsFixed(0)}';
    return '$code ${n.toStringAsFixed(2)}';
  }

  String get formattedTotal => formatMoney(totalPrice, currency);
  String get formattedUnitPrice => formatMoney(unitPrice, currency);
  String get formattedShipping => formatMoney(shippingCost, currency);
  String get formattedItemsTotal => formatMoney(unitPrice * count, currency);
  String get shortOrderNumber => id.length >= 8 ? '#${id.substring(0, 8)}' : '#$id';
  String get stateLabelText => stateLabel(state);
  String? get nextState => nextOrderState(state);
  String? get prevState => prevOrderState(state);

  bool canTransitionTo(String target) => canTransition(state, target);

  String get createdAtLabel {
    final at = createdAt;
    if (at == null) return 'Recently';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[at.month - 1]} ${at.day}, ${at.year}';
  }

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    final rawTotal = json['totalPrice'];
    double total = 0.0;
    if (rawTotal is num) {
      total = rawTotal.toDouble();
    } else if (rawTotal is String) {
      total = double.tryParse(rawTotal) ?? 0.0;
    }

    final rawUnit = json['variantPrice'] ?? json['unitPrice'];
    double unit = 0.0;
    if (rawUnit is num) {
      unit = rawUnit.toDouble();
    } else if (rawUnit is String) {
      unit = double.tryParse(rawUnit) ?? 0.0;
    }

    final rawShipping = json['shippingCost'];
    double shipping = 0.0;
    if (rawShipping is num) {
      shipping = rawShipping.toDouble();
    } else if (rawShipping is String) {
      shipping = double.tryParse(rawShipping) ?? 0.0;
    }

    return OrderModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      customerId: _nullIfEmpty(json['customerId']),
      customerName: json['customerName']?.toString() ?? 'Customer',
      customerPhone: _nullIfEmpty(json['customerPhone']),
      customerEmail: _nullIfEmpty(json['customerEmail']),
      customerAddress: _nullIfEmpty(json['customerAddress']),
      productId: _nullIfEmpty(json['productId']),
      productName: _nullIfEmpty(json['productName']),
      variantId: _nullIfEmpty(json['variantId']),
      variantName: _nullIfEmpty(json['variantName']),
      variantShortId: _nullIfEmpty(json['variantShortId']),
      variantImageUrl: _nullIfEmpty(json['variantImageUrl']),
      count: (json['count'] as num?)?.toInt() ??
          int.tryParse(json['count']?.toString() ?? '') ??
          1,
      unitPrice: unit,
      shippingCost: shipping,
      totalPrice: total,
      currency: json['currency']?.toString() ?? 'BDT',
      state: normalizeState(json['state']),
      paymentMethod: _nullIfEmpty(json['paymentMethod']),
      transactionId: _nullIfEmpty(json['transactionId'] ?? json['paymentReference']),
      paymentStrategy: _nullIfEmpty(json['paymentStrategy']),
      conversationId: _nullIfEmpty(json['conversationId']),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  static String? _nullIfEmpty(dynamic value) {
    if (value == null) return null;
    final text = value.toString();
    return text.isEmpty ? null : text;
  }

  OrderModel copyWith({
    String? customerName,
    String? customerPhone,
    String? customerAddress,
    int? count,
    double? unitPrice,
    double? shippingCost,
    double? totalPrice,
    String? state,
    String? paymentMethod,
    String? transactionId,
    String? paymentStrategy,
    String? conversationId,
  }) {
    return OrderModel(
      id: id,
      businessId: businessId,
      customerId: customerId,
      customerName: customerName ?? this.customerName,
      customerPhone: customerPhone ?? this.customerPhone,
      customerEmail: customerEmail,
      customerAddress: customerAddress ?? this.customerAddress,
      productId: productId,
      productName: productName,
      variantId: variantId,
      variantName: variantName,
      variantShortId: variantShortId,
      variantImageUrl: variantImageUrl,
      count: count ?? this.count,
      unitPrice: unitPrice ?? this.unitPrice,
      shippingCost: shippingCost ?? this.shippingCost,
      totalPrice: totalPrice ?? this.totalPrice,
      currency: currency,
      state: state == null ? this.state : normalizeState(state),
      paymentMethod: paymentMethod ?? this.paymentMethod,
      transactionId: transactionId ?? this.transactionId,
      paymentStrategy: paymentStrategy ?? this.paymentStrategy,
      conversationId: conversationId ?? this.conversationId,
      createdAt: createdAt,
    );
  }
}
