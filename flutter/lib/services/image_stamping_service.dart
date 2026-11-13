import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

/// Corner positions where the variant short ID can be stamped.
enum StampCorner {
  topLeft('top-left', 'Top left'),
  topRight('top-right', 'Top right'),
  bottomLeft('bottom-left', 'Bottom left'),
  bottomRight('bottom-right', 'Bottom right');

  final String value;
  final String label;
  const StampCorner(this.value, this.label);

  static StampCorner fromValue(String? val) {
    for (final c in StampCorner.values) {
      if (c.value == val) return c;
    }
    return StampCorner.topRight;
  }
}

class ImageStampingService {
  static const double maxEdge = 2048.0;
  static const int maxStoredBytes = 4 * 1024 * 1024; // 4 MB cap
  static const List<int> qualities = [90, 80, 68, 55];

  /// Burns the variant short ID badge onto the image in the specified corner.
  /// Exactly replicates the web's canvas drawing and compression logic.
  static Future<Uint8List> stampVariantId({
    required Uint8List imageBytes,
    required String? label,
    StampCorner corner = StampCorner.topRight,
  }) async {
    // If no label or row has no short ID, return compressed image as is
    if (label == null || label.trim().isEmpty) {
      return _compressImage(imageBytes);
    }

    final cleanLabel = label.trim().startsWith('#') ? label.trim() : '#${label.trim()}';

    // Decode original image frame with Flutter ui codec
    final codec = await ui.instantiateImageCodec(imageBytes);
    final frame = await codec.getNextFrame();
    final ui.Image originalImage = frame.image;

    final int rawWidth = originalImage.width;
    final int rawHeight = originalImage.height;

    // Rescale if larger than maxEdge (2048)
    final double scale = (rawWidth > maxEdge || rawHeight > maxEdge)
        ? maxEdge / math.max(rawWidth, rawHeight)
        : 1.0;
    final int targetWidth = math.max(1, (rawWidth * scale).round());
    final int targetHeight = math.max(1, (rawHeight * scale).round());

    // Prepare Flutter Canvas recording
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(
      recorder,
      Rect.fromLTWH(0, 0, targetWidth.toDouble(), targetHeight.toDouble()),
    );

    // Draw opaque white backdrop for JPEG flattening
    canvas.drawRect(
      Rect.fromLTWH(0, 0, targetWidth.toDouble(), targetHeight.toDouble()),
      Paint()..color = const Color(0xFFFFFFFF),
    );

    // Draw image onto target canvas
    canvas.drawImageRect(
      originalImage,
      Rect.fromLTWH(0, 0, rawWidth.toDouble(), rawHeight.toDouble()),
      Rect.fromLTWH(0, 0, targetWidth.toDouble(), targetHeight.toDouble()),
      Paint()..filterQuality = FilterQuality.high,
    );

    // Stamping calculations matching web
    final double side = math.max(targetWidth, targetHeight).toDouble();
    final double fontSize = (side * 0.05).clamp(16.0, 72.0);
    final double margin = side * 0.03;
    final double padX = fontSize * 0.42;
    final double padY = fontSize * 0.26;

    final textSpan = TextSpan(
      text: cleanLabel,
      style: TextStyle(
        color: const Color(0xFFFFFFFF),
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        fontFamily: 'sans-serif',
      ),
    );

    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();

    final double textWidth = textPainter.width;
    final double boxWidth = textWidth + padX * 2;
    final double boxHeight = fontSize + padY * 2;

    double x;
    double y;

    switch (corner) {
      case StampCorner.topLeft:
        x = margin;
        y = margin;
        break;
      case StampCorner.topRight:
        x = targetWidth - margin - boxWidth;
        y = margin;
        break;
      case StampCorner.bottomLeft:
        x = margin;
        y = targetHeight - margin - boxHeight;
        break;
      case StampCorner.bottomRight:
        x = targetWidth - margin - boxWidth;
        y = targetHeight - margin - boxHeight;
        break;
    }

    final bgRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, boxWidth, boxHeight),
      Radius.circular(fontSize * 0.3),
    );

    // Shadow
    final shadowPaint = Paint()
      ..color = const Color(0x73000000) // rgba(0, 0, 0, 0.45)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, fontSize * 0.35);
    canvas.drawRRect(
      bgRect.shift(Offset(0, math.max(1, fontSize * 0.05))),
      shadowPaint,
    );

    // Translucent dark slate plate: rgba(15, 23, 42, 0.62)
    final platePaint = Paint()..color = const Color(0x9E0F172A);
    canvas.drawRRect(bgRect, platePaint);

    // Draw text
    textPainter.paint(canvas, Offset(x + padX, y + padY));

    // Render picture to image
    final picture = recorder.endRecording();
    final renderedImage = await picture.toImage(targetWidth, targetHeight);
    final byteData = await renderedImage.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) {
      throw Exception('Failed to render stamped image');
    }

    final pngBytes = byteData.buffer.asUint8List();
    return _compressImage(pngBytes);
  }

  /// Compresses the image using package:image with descending quality until within 4MB.
  static Uint8List _compressImage(Uint8List bytes) {
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return bytes;

    // Resize if any side exceeds 2048
    img.Image prepared = decoded;
    if (decoded.width > maxEdge || decoded.height > maxEdge) {
      if (decoded.width >= decoded.height) {
        prepared = img.copyResize(decoded, width: maxEdge.toInt());
      } else {
        prepared = img.copyResize(decoded, height: maxEdge.toInt());
      }
    }

    for (final q in qualities) {
      final jpg = img.encodeJpg(prepared, quality: q);
      if (jpg.length <= maxStoredBytes) {
        return Uint8List.fromList(jpg);
      }
    }

    // Fallback to lowest quality if still over 4MB
    return Uint8List.fromList(img.encodeJpg(prepared, quality: 50));
  }
}
