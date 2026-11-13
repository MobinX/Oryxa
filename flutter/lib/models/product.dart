class ProductOptionModel {
  final String? id;
  final String name;
  final List<String> values;

  ProductOptionModel({
    this.id,
    required this.name,
    this.values = const [],
  });

  factory ProductOptionModel.fromJson(Map<String, dynamic> json) {
    final rawValues = json['values'];
    final vals = <String>[];
    if (rawValues is List) {
      for (final v in rawValues) {
        if (v is Map && v['value'] != null) {
          vals.add(v['value'].toString());
        } else if (v != null) {
          vals.add(v.toString());
        }
      }
    }
    return ProductOptionModel(
      id: json['id']?.toString(),
      name: json['name']?.toString() ?? '',
      values: vals,
    );
  }

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        'name': name,
        'values': values,
      };
}

class ProductModel {
  final String id;
  final String businessId;
  final String name;
  final String? description;
  final double price;
  final double? regularPrice;
  final String currency;
  final int stock;
  final String? sku;
  final String? slug;
  final String? imageUrl;
  final List<String> images;
  final String? categoryId;
  final String? categoryName;
  final String? customerId;
  final String? variantId;
  final int variantCount;
  final String? paymentStrategyOverride;
  final bool showInStorefront;
  final bool hasDiscount;
  final double discountPercent;
  final List<String> tags;
  final List<ProductOptionModel> options;
  final List<ProductVariantModel> variants;
  final DateTime? createdAt;

  ProductModel({
    required this.id,
    required this.businessId,
    required this.name,
    this.description,
    this.price = 0.0,
    this.regularPrice,
    this.currency = 'BDT',
    this.stock = 0,
    this.sku,
    this.slug,
    this.imageUrl,
    this.images = const [],
    this.categoryId,
    this.categoryName,
    this.customerId,
    this.variantId,
    this.variantCount = 1,
    this.paymentStrategyOverride,
    this.showInStorefront = true,
    this.hasDiscount = false,
    this.discountPercent = 0,
    this.tags = const [],
    this.options = const [],
    this.variants = const [],
    this.createdAt,
  });

  String get currencySymbol {
    switch (currency.toUpperCase()) {
      case 'BDT':
        return '৳';
      case 'USD':
        return '\$';
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      case 'INR':
        return '₹';
      default:
        return '$currency ';
    }
  }

  String get formattedPrice => '$currencySymbol${price.toStringAsFixed(0)}';
  String? get formattedRegularPrice =>
      regularPrice != null ? '$currencySymbol${regularPrice!.toStringAsFixed(0)}' : null;

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

    final curr = (json['currency']?.toString().trim().toUpperCase()) ?? 'BDT';

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

    final tagList = <String>[];
    if (json['tags'] is List) {
      for (final t in json['tags'] as List) {
        if (t != null && t.toString().trim().isNotEmpty) {
          tagList.add(t.toString().trim());
        }
      }
    }

    final optionList = <ProductOptionModel>[];
    if (json['options'] is List) {
      for (final raw in json['options'] as List) {
        if (raw is Map) {
          optionList.add(ProductOptionModel.fromJson(Map<String, dynamic>.from(raw)));
        }
      }
    }

    return ProductModel(
      id: json['id']?.toString() ?? '',
      businessId: json['businessId']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Product',
      description: json['description']?.toString(),
      price: p,
      regularPrice: rp,
      currency: curr.isEmpty ? 'BDT' : curr,
      stock: parsedStock,
      sku: json['sku']?.toString(),
      slug: json['slug']?.toString(),
      imageUrl: singleImg,
      images: imgList,
      categoryId: json['categoryId']?.toString(),
      categoryName: (json['categoryName'] ?? (json['category'] is Map ? json['category']['name'] : null))?.toString(),
      customerId: json['customerId']?.toString() ?? (json['customer'] is Map ? json['customer']['id']?.toString() : null),
      variantId: firstVarId,
      variantCount: (json['variantCount'] as num?)?.toInt() ??
          (parsedVariants.isNotEmpty ? parsedVariants.length : 1),
      paymentStrategyOverride: json['paymentStrategyOverride']?.toString(),
      showInStorefront: json['showInStorefront'] != false,
      hasDiscount: json['hasDiscount'] == true,
      discountPercent: (json['discountPercent'] as num?)?.toDouble() ??
          double.tryParse(json['discountPercent']?.toString() ?? '') ??
          0,
      tags: tagList,
      options: optionList,
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
        'currency': currency,
        'stock': stock,
        'sku': sku,
        'slug': slug,
        'imageUrl': imageUrl,
        'images': images,
        'categoryId': categoryId,
        'customerId': customerId,
        'hasDiscount': hasDiscount,
        'discountPercent': discountPercent,
        'tags': tags,
        'options': options.map((o) => o.toJson()).toList(),
        'variants': variants.map((v) => v.toJson()).toList(),
      };
}

class ProductVariantModel {
  final String id;
  final String name;
  final double price;
  final int stock;
  final String? imageUrl;
  final List<String> imageUrls;
  final String? imageKey;
  final List<String> imageKeys;
  final String? shortId;
  final bool isAvailable;
  final Map<String, String> options;

  ProductVariantModel({
    required this.id,
    required this.name,
    this.price = 0.0,
    this.stock = 0,
    this.imageUrl,
    this.imageUrls = const [],
    this.imageKey,
    this.imageKeys = const [],
    this.shortId,
    this.isAvailable = true,
    this.options = const {},
  });

  String? get variantId => shortId;

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

    final keys = <String>[];
    if (json['imageKeys'] is List) {
      for (final raw in json['imageKeys'] as List) {
        final k = raw?.toString();
        if (k != null && k.isNotEmpty) keys.add(k);
      }
    }
    final singleKey = json['imageKey']?.toString();
    if (singleKey != null && singleKey.isNotEmpty && !keys.contains(singleKey)) {
      keys.insert(0, singleKey);
    }

    final opts = <String, String>{};
    if (json['options'] is Map) {
      (json['options'] as Map).forEach((k, v) {
        if (k != null && v != null) {
          opts[k.toString()] = v.toString();
        }
      });
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
      imageKey: singleKey ?? (keys.isNotEmpty ? keys.first : null),
      imageKeys: keys,
      shortId: json['variantId']?.toString(),
      isAvailable: json['isAvailable'] != false,
      options: opts,
    );
  }

  Map<String, dynamic> toJson() => {
        if (id.isNotEmpty) 'id': id,
        'name': name,
        'price': price,
        'stock': stock,
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (imageUrls.isNotEmpty) 'imageUrls': imageUrls,
        if (imageKey != null) 'imageKey': imageKey,
        if (imageKeys.isNotEmpty) 'imageKeys': imageKeys,
        if (shortId != null) 'variantId': shortId,
        'isAvailable': isAvailable,
        if (options.isNotEmpty) 'options': options,
      };

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
