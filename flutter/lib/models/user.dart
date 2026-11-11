class UserModel {
  final String id;
  final String firebaseUid;
  final String name;
  final String? email;
  final String? role;

  UserModel({
    required this.id,
    required this.firebaseUid,
    required this.name,
    this.email,
    this.role,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? '',
      firebaseUid: json['firebaseUid']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Merchant',
      email: json['email']?.toString(),
      role: json['role']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'firebaseUid': firebaseUid,
        'name': name,
        'email': email,
        'role': role,
      };
}
