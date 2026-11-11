class CustomerModel {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final String? address;
  final double totalSpend;
  final int orderCount;
  final String? notes;
  final DateTime? createdAt;

  CustomerModel({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.address,
    this.totalSpend = 0.0,
    this.orderCount = 0,
    this.notes,
    this.createdAt,
  });

  String get formattedSpend => '৳${totalSpend.toStringAsFixed(0)}';

  factory CustomerModel.fromJson(Map<String, dynamic> json) {
    final rawSpend = json['totalSpend'];
    double spend = 0.0;
    if (rawSpend is num) {
      spend = rawSpend.toDouble();
    } else if (rawSpend is String) {
      spend = double.tryParse(rawSpend) ?? 0.0;
    }

    return CustomerModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Customer',
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      address: json['address']?.toString(),
      totalSpend: spend,
      orderCount: (json['orderCount'] as num?)?.toInt() ?? 0,
      notes: json['notes']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'phone': phone,
        'email': email,
        'address': address,
        'notes': notes,
      };
}
