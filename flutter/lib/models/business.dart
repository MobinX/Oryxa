class BusinessModel {
  final String id;
  final String name;
  final String? slug;
  final String? description;
  final String? phone;
  final String? email;
  final String? website;
  final String? address;
  final bool agentState;
  final String? storeTheme;
  final String? storePreset;
  final String? agentProductGuidance;
  final String? agentBargainGuidance;
  final List<DeliveryZoneModel> deliveryZones;
  final List<PaymentMethodModel> paymentMethods;
  final String? paymentStrategy;
  final DateTime? createdAt;

  BusinessModel({
    required this.id,
    required this.name,
    this.slug,
    this.description,
    this.phone,
    this.email,
    this.website,
    this.address,
    this.agentState = true,
    this.storeTheme,
    this.storePreset,
    this.agentProductGuidance,
    this.agentBargainGuidance,
    this.deliveryZones = const [],
    this.paymentMethods = const [],
    this.paymentStrategy,
    this.createdAt,
  });

  factory BusinessModel.fromJson(Map<String, dynamic> json) {
    return BusinessModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Store',
      slug: json['slug']?.toString(),
      description: json['description']?.toString(),
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      website: json['website']?.toString(),
      address: json['address']?.toString(),
      agentState: json['agentState'] != false,
      storeTheme: (json['storeTheme'] ?? json['storePreset'])?.toString(),
      storePreset: json['storePreset']?.toString(),
      agentProductGuidance: json['agentProductGuidance']?.toString(),
      agentBargainGuidance: json['agentBargainGuidance']?.toString(),
      deliveryZones: json['deliveryZones'] is List
          ? (json['deliveryZones'] as List)
              .whereType<Map>()
              .map((z) => DeliveryZoneModel.fromJson(Map<String, dynamic>.from(z)))
              .toList()
          : const [],
      paymentMethods: json['paymentMethods'] is List
          ? (json['paymentMethods'] as List)
              .whereType<Map>()
              .map((m) => PaymentMethodModel.fromJson(Map<String, dynamic>.from(m)))
              .toList()
          : const [],
      paymentStrategy: json['paymentStrategy']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'slug': slug,
        'description': description,
        'phone': phone,
        'email': email,
        'website': website,
        'address': address,
        'agentState': agentState,
        'storeTheme': storeTheme,
        'storePreset': storePreset,
      };

  BusinessModel copyWith({
    String? name,
    String? description,
    String? phone,
    String? email,
    String? address,
    bool? agentState,
    String? storeTheme,
    String? agentProductGuidance,
    String? agentBargainGuidance,
  }) {
    return BusinessModel(
      id: id,
      name: name ?? this.name,
      slug: slug,
      description: description ?? this.description,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      website: website,
      address: address ?? this.address,
      agentState: agentState ?? this.agentState,
      storeTheme: storeTheme ?? this.storeTheme,
      storePreset: storePreset,
      agentProductGuidance: agentProductGuidance ?? this.agentProductGuidance,
      agentBargainGuidance: agentBargainGuidance ?? this.agentBargainGuidance,
      deliveryZones: deliveryZones,
      paymentMethods: paymentMethods,
      paymentStrategy: paymentStrategy,
      createdAt: createdAt,
    );
  }
}

class DeliveryZoneModel {
  final String label;
  final double price;

  DeliveryZoneModel({required this.label, required this.price});

  factory DeliveryZoneModel.fromJson(Map<String, dynamic> json) {
    return DeliveryZoneModel(
      label: json['label']?.toString() ?? 'Delivery area',
      price: (json['price'] as num?)?.toDouble() ??
          double.tryParse(json['price']?.toString() ?? '') ??
          0,
    );
  }
}

class PaymentMethodModel {
  final String name;
  final String? info;
  final bool requiresTransactionId;

  PaymentMethodModel({
    required this.name,
    this.info,
    this.requiresTransactionId = false,
  });

  factory PaymentMethodModel.fromJson(Map<String, dynamic> json) {
    return PaymentMethodModel(
      name: json['name']?.toString() ?? '',
      info: json['info']?.toString(),
      requiresTransactionId: json['requiresTransactionId'] == true,
    );
  }
}

class BusinessStats {
  final int products;
  final int orders;
  final int channels;
  final int conversations;
  final double revenue;
  final int messages;

  BusinessStats({
    this.products = 0,
    this.orders = 0,
    this.channels = 0,
    this.conversations = 0,
    this.revenue = 0.0,
    this.messages = 0,
  });

  factory BusinessStats.fromJson(Map<String, dynamic> json) {
    return BusinessStats(
      products: (json['products'] as num?)?.toInt() ?? 0,
      orders: (json['orders'] as num?)?.toInt() ?? 0,
      channels: (json['channels'] as num?)?.toInt() ?? 0,
      conversations: (json['conversations'] as num?)?.toInt() ?? 0,
      revenue: (json['revenue'] as num?)?.toDouble() ?? 0.0,
      messages: (json['messages'] as num?)?.toInt() ?? 0,
    );
  }
}
