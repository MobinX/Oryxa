class OrderModel {
  final String id;
  final String businessId;
  final String customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? customerAddress;
  final String? productName;
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
  final DateTime? createdAt;

  OrderModel({
    required this.id,
    required this.businessId,
    required this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.customerAddress,
    this.productName,
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
    this.createdAt,
  });

  String get formattedTotal => '৳${totalPrice.toStringAsFixed(0)}';
  String get shortOrderNumber => id.length >= 8 ? '#${id.substring(0, 8)}' : '#$id';

  static const List<String> validStates = [
    'pending',
    'acknowledged',
    'onDelivery',
    'done',
    'cancelled',
  ];

  static String stateTitle(String state) {
    switch (state) {
      case 'pending':
        return 'Order Placed';
      case 'acknowledged':
        return 'Confirmed';
      case 'onDelivery':
        return 'On Delivery';
      case 'done':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      default:
        return state;
    }
  }

  String? get nextState {
    switch (state) {
      case 'pending':
        return 'acknowledged';
      case 'acknowledged':
        return 'onDelivery';
      case 'onDelivery':
        return 'done';
      default:
        return null;
    }
  }

  String? get prevState {
    switch (state) {
      case 'done':
        return 'onDelivery';
      case 'onDelivery':
        return 'acknowledged';
      case 'acknowledged':
        return 'pending';
      default:
        return null;
    }
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
      customerName: json['customerName']?.toString() ?? 'Customer',
      customerPhone: json['customerPhone']?.toString(),
      customerEmail: json['customerEmail']?.toString(),
      customerAddress: json['customerAddress']?.toString(),
      productName: json['productName']?.toString(),
      variantName: json['variantName']?.toString(),
      variantShortId: json['variantShortId']?.toString(),
      variantImageUrl: json['variantImageUrl']?.toString(),
      count: (json['count'] as num?)?.toInt() ?? 1,
      unitPrice: unit,
      shippingCost: shipping,
      totalPrice: total,
      currency: json['currency']?.toString() ?? 'BDT',
      state: json['state']?.toString() ?? 'pending',
      paymentMethod: json['paymentMethod']?.toString(),
      transactionId: (json['transactionId'] ?? json['paymentReference'])?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  OrderModel copyWith({
    String? state,
  }) {
    return OrderModel(
      id: id,
      businessId: businessId,
      customerName: customerName,
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      customerAddress: customerAddress,
      productName: productName,
      variantName: variantName,
      variantShortId: variantShortId,
      variantImageUrl: variantImageUrl,
      count: count,
      unitPrice: unitPrice,
      shippingCost: shippingCost,
      totalPrice: totalPrice,
      currency: currency,
      state: state ?? this.state,
      paymentMethod: paymentMethod,
      transactionId: transactionId,
      createdAt: createdAt,
    );
  }
}
