import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pro_image_editor/pro_image_editor.dart';
import 'package:provider/provider.dart';

import '../config/app_theme.dart';
import '../services/api_service.dart';

class PostImageEditorDialog {
  /// Opens image picker (source selector), then presents [ProImageEditor] so the
  /// user can crop, rotate, flip, draw, and filter the photo, and finally uploads
  /// the result to the server, returning the uploaded image preview URL.
  static Future<String?> pickEditAndUpload({
    required BuildContext context,
    required String businessId,
    ImageSource? initialSource,
  }) async {
    final picker = ImagePicker();

    ImageSource? source = initialSource;
    if (source == null) {
      source = await showModalBottomSheet<ImageSource>(
        context: context,
        backgroundColor: Theme.of(context).cardColor,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const Text(
                  'Attach Photo to Post',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFF1F5F9),
                    child: Icon(Icons.photo_library_outlined, color: AppTheme.primary),
                  ),
                  title: const Text('Choose from Gallery'),
                  subtitle: const Text('Pick an existing photo to edit & attach'),
                  onTap: () => Navigator.pop(ctx, ImageSource.gallery),
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFF1F5F9),
                    child: Icon(Icons.camera_alt_outlined, color: AppTheme.primary),
                  ),
                  title: const Text('Take with Camera'),
                  subtitle: const Text('Capture a fresh photo with camera'),
                  onTap: () => Navigator.pop(ctx, ImageSource.camera),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (source == null || !context.mounted) return null;

    final picked = await picker.pickImage(
      source: source,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
    );
    if (picked == null || !context.mounted) return null;

    final originalBytes = await picked.readAsBytes();
    if (!context.mounted) return null;

    // Open ProImageEditor for editing
    Uint8List? editedBytes;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (editorCtx) => ProImageEditor.memory(
          originalBytes,
          callbacks: ProImageEditorCallbacks(
            onImageEditingComplete: (Uint8List result) async {
              editedBytes = result;
              Navigator.pop(editorCtx);
            },
          ),
          configs: const ProImageEditorConfigs(),
        ),
      ),
    );

    if (editedBytes == null || !context.mounted) return null;

    // Show upload progress indicator dialog
    final progressCtx = context;
    showDialog(
      context: progressCtx,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Uploading post image...', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      final api = context.read<ApiService>();
      final filename = 'post_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final res = await api.uploadVariantImage(
        businessId: businessId,
        bytes: editedBytes!,
        filename: filename,
      );

      if (context.mounted) {
        Navigator.of(progressCtx, rootNavigator: true).pop(); // dismiss loading dialog
      }

      return res['url'] ?? res['key'];
    } catch (e) {
      if (context.mounted) {
        Navigator.of(progressCtx, rootNavigator: true).pop(); // dismiss loading dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
      return null;
    }
  }
}
