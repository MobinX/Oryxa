class AdminUser {
  final String id;
  final String email;
  final String? name;
  final String role; // 'superuser' | 'admin'
  final List<String> capabilities;
  final bool isActive;
  final bool legacy;

  const AdminUser({
    required this.id,
    required this.email,
    this.name,
    required this.role,
    required this.capabilities,
    this.isActive = true,
    this.legacy = false,
  });

  bool get isSuperuser => role == 'superuser';

  bool hasCapability(String cap) {
    if (isSuperuser) return true;
    return capabilities.contains(cap);
  }

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    final rawCaps = json['capabilities'];
    final List<String> caps = [];
    if (rawCaps is List) {
      for (final item in rawCaps) {
        if (item is String) caps.add(item);
      }
    }

    return AdminUser(
      id: (json['id'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      name: json['name']?.toString(),
      role: (json['role'] ?? 'admin').toString(),
      capabilities: caps,
      isActive: json['isActive'] != false,
      legacy: json['legacy'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'name': name,
    'role': role,
    'capabilities': capabilities,
    'isActive': isActive,
    'legacy': legacy,
  };
}
