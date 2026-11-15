import 'dart:ui' as ui;
import 'package:flutter_test/flutter_test.dart';
import 'package:onlyorders/models/product.dart';
import 'package:onlyorders/services/image_stamping_service.dart';
import 'package:onlyorders/utils/product_utils.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Product Utils Tests', () {
    test('makeVariantId generates valid 5-character alphanumeric strings', () {
      final idRegex = RegExp(r'^[A-Z0-9]{5}$');
      final letterRegex = RegExp(r'[A-Z]');
      final numberRegex = RegExp(r'[0-9]');

      for (int i = 0; i < 50; i++) {
        final id = makeVariantId();
        expect(id.length, 5);
        expect(idRegex.hasMatch(id), isTrue, reason: '$id must match ^[A-Z0-9]{5}\$');

        final letterCount = letterRegex.allMatches(id).length;
        final numberCount = numberRegex.allMatches(id).length;
        expect(letterCount, 3, reason: '$id should contain exactly 3 uppercase letters');
        expect(numberCount, 2, reason: '$id should contain exactly 2 digits');
      }
    });

    test('slugify converts titles to url-safe slugs', () {
      expect(slugify('Premium Cotton T-Shirt'), 'premium-cotton-t-shirt');
      expect(slugify('  Special   Deal! #123  '), 'special-deal-123');
      expect(slugify('Red / Blue / XL'), 'red-blue-xl');
    });

    test('payment strategy helpers return expected labels and descriptions', () {
      expect(paymentStrategyLabel('cod'), 'Cash on Delivery (COD)');
      expect(paymentStrategyLabel('delivery_prepaid'), 'Delivery Charge Prepaid');
      expect(paymentStrategyLabel('full_prepaid'), 'Full Payment Prepaid');
    });
  });

  group('Product and Variant Models Tests', () {
    test('ProductModel and ProductOptionModel serialization and parsing', () {
      final json = {
        'id': 'p-1',
        'businessId': 'biz-1',
        'name': 'Silk Kurti',
        'price': 1200.0,
        'currency': 'BDT',
        'sku': 'SKU-001',
        'slug': 'silk-kurti',
        'hasDiscount': true,
        'discountPercent': 15.0,
        'tags': ['kurti', 'silk'],
        'options': [
          {
            'name': 'Color',
            'values': ['Red', 'Green'],
          },
          {
            'name': 'Size',
            'values': ['M', 'L', 'XL'],
          }
        ],
        'variants': [
          {
            'id': 'v-1',
            'name': 'Red / M',
            'price': 1200.0,
            'stock': 25,
            'variantId': 'K9X2B',
            'imageUrls': ['https://example.com/red.jpg'],
            'imageKeys': ['biz-1/images/red.jpg'],
            'options': {'Color': 'Red', 'Size': 'M'},
          }
        ],
      };

      final product = ProductModel.fromJson(json);
      expect(product.name, 'Silk Kurti');
      expect(product.currency, 'BDT');
      expect(product.formattedPrice, '৳1200');
      expect(product.options.length, 2);
      expect(product.options[0].name, 'Color');
      expect(product.options[0].values, ['Red', 'Green']);
      expect(product.variants.length, 1);

      final variant = product.variants.first;
      expect(variant.shortId, 'K9X2B');
      expect(variant.variantId, 'K9X2B');
      expect(variant.options['Color'], 'Red');
      expect(variant.options['Size'], 'M');
      expect(variant.imageUrls, ['https://example.com/red.jpg']);
      expect(variant.imageKeys, ['biz-1/images/red.jpg']);

      final serialized = product.toJson();
      expect(serialized['name'], 'Silk Kurti');
      expect(serialized['options'].length, 2);
    });
  });

  group('Image Stamping Service Tests', () {
    test('stampVariantId stamps text onto an image frame', () async {
      // Create a 200x200 test RGB image using native dart:ui canvas
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      canvas.drawRect(
        const ui.Rect.fromLTWH(0, 0, 200, 200),
        ui.Paint()..color = const ui.Color(0xFFC8C8C8),
      );
      final picture = recorder.endRecording();
      final testImage = await picture.toImage(200, 200);
      final byteData = await testImage.toByteData(format: ui.ImageByteFormat.png);
      final rawBytes = byteData!.buffer.asUint8List();

      final stampedBytes = await ImageStampingService.stampVariantId(
        imageBytes: rawBytes,
        label: 'A7B2C',
        corner: StampCorner.topRight,
      );

      expect(stampedBytes, isNotNull);
      expect(stampedBytes.isNotEmpty, isTrue);

      final codec = await ui.instantiateImageCodec(stampedBytes);
      final frame = await codec.getNextFrame();
      expect(frame.image.width, 200);
      expect(frame.image.height, 200);
    });
  });
}
