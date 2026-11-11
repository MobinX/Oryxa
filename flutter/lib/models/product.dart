class ProductModel {
  final String id;
  final String businessId;
  final String name;
  final String? description;
  final double price;
  final double? regularPrice;
  final int stock;
  final String? sku;
  final String? imageUrl;
  final List<String> images;
  final String? categoryId;
  final String? categoryName;
  final String? variantId;
  final int variantCount;
  final DateTime? createdAt;

  ProductModel({
    required this.id,
    required this.businessId,
    required this.name,
    this.description,
    this.price = 0.0,
    this.regularPrice,
    this.stock = 0,
    this.sku,
    this.imageUrl,
    this.images = const [],
    this.categoryId,
    this.categoryName,
    this.variantId,
    this.variantCount = 1,
    this.createdAt,
  });

  String get formattedPrice => '৳${price.toStringAsFixed(0)}';
  String? get formattedRegularPrice =>
      regularPrice != null ? '৳${regularPrice!.toStringAsFixed(0)}' : null;

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    final rawPrice = json['price'];
    double p = 0.0;
    if (rawPrice is num) {
      p = rawPrice.toDouble();
    } else if (rawPrice is String) {
      p = double.tryParse(rawPrice) ?? 0.0;
    }

    final rawReg = json['regularPrice'];
    double? rp;
    if (rawReg is num) {
      rp = rawReg.toDouble();
    } else if (rawReg is String) {
      rp = double.tryParse(rawReg);
    }

    List<String> imgList = [];
    if (json['images'] is List) {
      imgList = (json['images'] as List).map((e) => e.toString()).toList();
    } else if (json['imageUrls'] is List) {
      imgList = (json['imageUrls'] as List).map((e) => e.toString()).toList();
    }

    String? singleImg = json['imageUrl']?.toString() ?? json['thumbnailUrl']?.toString();
    if (singleImg == null && imgList.isNotEmpty) {
      singleImg = imgList.first;
    }

    String? firstVarId;
    int parsedStock = 0;
    if (json['variants'] is List && (json['variants'] as List).isNotEmpty) {
      final firstVar = (json['variants'] as List).first;
      if (firstVar is Map<String, dynamic>) {
        firstVarId = firstVar['id']?.toString();
        parsedStock = (firstVar['stock'] as num?)?.toInt() ?? 0;
        if (singleImg == null || singleImg.isEmpty) {
          singleImg = firstVar['imageUrl']?.toString();
        }
      }
    } else {
      parsedStock = (json['stock'] as num?)?.toInt() ?? 0;
    }

    return ProductModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Product',
      description: json['description']?.toString(),
      price: p,
      regularPrice: rp,
      stock: parsedStock,
      sku: json['sku']?.toString(),
      imageUrl: singleImg,
      images: imgList,
      categoryId: json['categoryId']?.toString(),
      categoryName: json['categoryName']?.toString(),
      variantId: firstVarId,
      variantCount: (json['variantCount'] as num?)?.toInt() ?? 1,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
        'price': price,
        'regularPrice': regularPrice,
        'stock': stock,
        'sku': sku,
        'imageUrl': imageUrl,
        'images': images,
        'categoryId': categoryId,
      };
}

class CategoryModel {
  final String id;
  final String name;
  final String? slug;

  CategoryModel({
    required this.id,
    required this.name,
    this.slug,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      slug: json['slug']?.toString(),
    );
  }
}
