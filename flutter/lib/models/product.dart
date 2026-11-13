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
  final String? paymentStrategyOverride;
  final bool showInStorefront;
  final bool hasDiscount;
  final double discountPercent;
  final List<ProductVariantModel> variants;
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
    this.paymentStrategyOverride,
    this.showInStorefront = true,
    this.hasDiscount = false,
    this.discountPercent = 0,
    this.variants = const [],
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
    final parsedVariants = <ProductVariantModel>[];
    if (json['variants'] is List) {
      for (final raw in json['variants'] as List) {
        if (raw is Map) {
          parsedVariants.add(ProductVariantModel.fromJson(Map<String, dynamic>.from(raw)));
        }
      }
    }
    if (parsedVariants.isNotEmpty) {
      final firstVar = parsedVariants.first;
      firstVarId = firstVar.id;
      parsedStock = firstVar.stock;
      if (singleImg == null || singleImg.isEmpty) {
        singleImg = firstVar.imageUrl;
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
      categoryName: (json['categoryName'] ?? (json['category'] is Map ? json['category']['name'] : null))?.toString(),
      variantId: firstVarId,
      variantCount: (json['variantCount'] as num?)?.toInt() ??
          (parsedVariants.isNotEmpty ? parsedVariants.length : 1),
      paymentStrategyOverride: json['paymentStrategyOverride']?.toString(),
      showInStorefront: json['showInStorefront'] != false,
      hasDiscount: json['hasDiscount'] == true,
      discountPercent: (json['discountPercent'] as num?)?.toDouble() ??
          double.tryParse(json['discountPercent']?.toString() ?? '') ??
          0,
      variants: parsedVariants,
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

class ProductVariantModel {
  final String id;
  final String name;
  final double price;
  final int stock;
  final String? imageUrl;
  final List<String> imageUrls;
  final String? shortId;
  final bool isAvailable;

  ProductVariantModel({
    required this.id,
    required this.name,
    this.price = 0.0,
    this.stock = 0,
    this.imageUrl,
    this.imageUrls = const [],
    this.shortId,
    this.isAvailable = true,
  });

  factory ProductVariantModel.fromJson(Map<String, dynamic> json) {
    final photos = <String>[];
    if (json['imageUrls'] is List) {
      for (final raw in json['imageUrls'] as List) {
        final url = raw?.toString();
        if (url != null && url.isNotEmpty) photos.add(url);
      }
    }
    final cover = json['imageUrl']?.toString();
    if (cover != null && cover.isNotEmpty && !photos.contains(cover)) {
      photos.insert(0, cover);
    }

    return ProductVariantModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Default',
      price: (json['price'] as num?)?.toDouble() ??
          double.tryParse(json['price']?.toString() ?? '') ??
          0,
      stock: (json['stock'] as num?)?.toInt() ?? 0,
      imageUrl: cover ?? (photos.isNotEmpty ? photos.first : null),
      imageUrls: photos,
      shortId: json['variantId']?.toString(),
      isAvailable: json['isAvailable'] != false,
    );
  }

  String get formattedPrice => '৳${price.toStringAsFixed(0)}';
  int get photoCount => imageUrls.isNotEmpty ? imageUrls.length : (imageUrl != null ? 1 : 0);
}

class CategoryModel {
  final String id;
  final String name;
  final String? slug;
  final int productCount;

  CategoryModel({
    required this.id,
    required this.name,
    this.slug,
    this.productCount = 0,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      slug: json['slug']?.toString(),
      productCount: (json['productCount'] as num?)?.toInt() ?? 0,
    );
  }
}
