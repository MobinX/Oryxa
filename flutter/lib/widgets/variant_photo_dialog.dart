import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pro_image_editor/pro_image_editor.dart';
import 'package:provider/provider.dart';

import '../config/app_theme.dart';
import '../services/api_service.dart';
import '../services/image_stamping_service.dart';

class UploadedVariantImage {
  final String key;
  final String previewUrl;

  const UploadedVariantImage({required this.key, required this.previewUrl});
}

/// A modal image editing and variant ID placement wizard matching web's VariantPhotoDialog.
/// Supports sequential multi-image queues, corner placement of variant short IDs,
/// optional advanced photo editing (cropping, rotation, filters via pro_image_editor),
/// and direct uploading to backend storage.
class VariantPhotoDialog extends StatefulWidget {
  final String businessId;
  final List<XFile> files;
  final String? variantId;
  final void Function(List<UploadedVariantImage> uploaded) onUploaded;

  const VariantPhotoDialog({
    super.key,
    required this.businessId,
    required this.files,
    required this.variantId,
    required this.onUploaded,
  });

  static Future<void> show({
    required BuildContext context,
    required String businessId,
    required List<XFile> files,
    required String? variantId,
    required void Function(List<UploadedVariantImage> uploaded) onUploaded,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => VariantPhotoDialog(
        businessId: businessId,
        files: files,
        variantId: variantId,
        onUploaded: onUploaded,
      ),
    );
  }

  @override
  State<VariantPhotoDialog> createState() => _VariantPhotoDialogState();
}

class _VariantPhotoDialogState extends State<VariantPhotoDialog> {
  int _currentIndex = 0;
  int _step = 1; // 1: Read/Prepare, 2: Place ID & Upload
  Uint8List? _currentBytes;
  bool _isLoadingBytes = true;
  StampCorner _selectedCorner = StampCorner.topRight;
  bool _isUploading = false;
  String? _errorMessage;

  final List<UploadedVariantImage> _uploadedResults = [];

  XFile get _currentFile => widget.files[_currentIndex];
  int get _remaining => widget.files.length - _currentIndex - 1;

  @override
  void initState() {
    super.initState();
    _loadFileBytes();
  }

  Future<void> _loadFileBytes() async {
    setState(() {
      _isLoadingBytes = true;
      _errorMessage = null;
    });

    try {
      final bytes = await _currentFile.readAsBytes();
      if (!mounted) return;
      setState(() {
        _currentBytes = bytes;
        _isLoadingBytes = false;
        _step = 1;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Could not read image file: $e';
        _isLoadingBytes = false;
      });
    }
  }

  Future<void> _openAdvancedEditor() async {
    if (_currentBytes == null) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => ProImageEditor.memory(
          _currentBytes!,
          callbacks: ProImageEditorCallbacks(
            onImageEditingComplete: (Uint8List editedBytes) async {
              Navigator.pop(ctx);
              setState(() {
                _currentBytes = editedBytes;
              });
            },
          ),
          configs: const ProImageEditorConfigs(),
        ),
      ),
    );
  }

  Future<void> _uploadCurrent() async {
    if (_currentBytes == null || _isUploading) return;

    setState(() {
      _isUploading = true;
      _errorMessage = null;
    });

    try {
      // 1. Stamp variant ID onto image bytes
      final stamped = await ImageStampingService.stampVariantId(
        imageBytes: _currentBytes!,
        label: widget.variantId,
        corner: _selectedCorner,
      );

      // 2. Upload to backend
      final api = context.read<ApiService>();
      final fileName = widget.variantId != null && widget.variantId!.isNotEmpty
          ? 'variant-${widget.variantId}.jpg'
          : 'variant.jpg';

      final res = await api.uploadVariantImage(
        businessId: widget.businessId,
        bytes: stamped,
        filename: fileName,
      );

      _uploadedResults.add(
        UploadedVariantImage(
          key: res['key'] ?? '',
          previewUrl: res['url'] ?? res['key'] ?? '',
        ),
      );

      // 3. Advance to next file or complete
      if (_currentIndex + 1 < widget.files.length) {
        if (!mounted) return;
        setState(() {
          _currentIndex++;
          _isUploading = false;
        });
        await _loadFileBytes();
      } else {
        if (!mounted) return;
        widget.onUploaded(_uploadedResults);
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isUploading = false;
        _errorMessage = 'Upload failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasId = widget.variantId != null && widget.variantId!.isNotEmpty;
    final idBadgeText = hasId ? '#${widget.variantId}' : 'no id';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 680),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Dialog Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _step == 1 ? '1 · Read the picture' : '2 · Place the variant id',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_currentFile.name}${_remaining > 0 ? " — $_remaining more after this" : ""}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: hasId ? AppTheme.primaryColor.withValues(alpha: 0.1) : Colors.grey.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      idBadgeText,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                        color: hasId ? AppTheme.primaryColor : Colors.grey.shade700,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Content Body
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: _isLoadingBytes
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(40),
                          child: CircularProgressIndicator(),
                        ),
                      )
                    : _step == 1
                        ? _buildStepOne()
                        : _buildStepTwo(),
              ),
            ),

            if (_errorMessage != null)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.danger.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
                ),
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: AppTheme.danger, fontSize: 12),
                ),
              ),

            // Footer actions
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
              ),
              child: _step == 1 ? _buildStepOneActions() : _buildStepTwoActions(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepOne() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_currentBytes != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 220,
              color: Colors.grey.withValues(alpha: 0.1),
              child: Image.memory(
                _currentBytes!,
                fit: BoxFit.contain,
              ),
            ),
          ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Ready to edit',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            Text(
              '100%',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
        const SizedBox(height: 6),
        LinearProgressIndicator(
          value: 1.0,
          backgroundColor: Colors.grey.withValues(alpha: 0.2),
          valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
          borderRadius: BorderRadius.circular(4),
          minHeight: 6,
        ),
        const SizedBox(height: 12),
        Text(
          'Nothing leaves the device yet. Next places the variant ID badge on the picture; only Upload stores it.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
        ),
      ],
    );
  }

  Widget _buildStepTwo() {
    final hasId = widget.variantId != null && widget.variantId!.isNotEmpty;
    final label = hasId ? '#${widget.variantId}' : '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Interactive live preview with stamp
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 220,
            color: Colors.grey.withValues(alpha: 0.1),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (_currentBytes != null)
                  Image.memory(
                    _currentBytes!,
                    fit: BoxFit.contain,
                  ),
                // Corner interactive badge overlay
                if (hasId)
                  Positioned.fill(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Stack(
                        children: [
                          if (_selectedCorner == StampCorner.topLeft)
                            Align(alignment: Alignment.topLeft, child: _buildStampBadge(label)),
                          if (_selectedCorner == StampCorner.topRight)
                            Align(alignment: Alignment.topRight, child: _buildStampBadge(label)),
                          if (_selectedCorner == StampCorner.bottomLeft)
                            Align(alignment: Alignment.bottomLeft, child: _buildStampBadge(label)),
                          if (_selectedCorner == StampCorner.bottomRight)
                            Align(alignment: Alignment.bottomRight, child: _buildStampBadge(label)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Corner selection dropdown
        Text(
          'Where the id goes',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade700),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<StampCorner>(
          initialValue: _selectedCorner,
          isDense: true,
          decoration: const InputDecoration(
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          items: StampCorner.values.map((corner) {
            return DropdownMenuItem(
              value: corner,
              child: Text(corner.label, style: const TextStyle(fontSize: 13)),
            );
          }).toList(),
          onChanged: _isUploading
              ? null
              : (val) {
                  if (val != null) setState(() => _selectedCorner = val);
                },
        ),
        const SizedBox(height: 8),

        // Corner quick-tap chips
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: StampCorner.values.map((c) {
            final isSelected = c == _selectedCorner;
            return ChoiceChip(
              label: Text(c.label, style: TextStyle(fontSize: 11, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
              selected: isSelected,
              onSelected: _isUploading ? null : (_) => setState(() => _selectedCorner = c),
              visualDensity: VisualDensity.compact,
            );
          }).toList(),
        ),
        const SizedBox(height: 12),

        // Advanced photo editor trigger
        OutlinedButton.icon(
          onPressed: _isUploading ? null : _openAdvancedEditor,
          icon: const Icon(Icons.tune, size: 16),
          label: const Text('Crop / Rotate / Filters', style: TextStyle(fontSize: 12)),
          style: OutlinedButton.styleFrom(
            visualDensity: VisualDensity.compact,
            side: BorderSide(color: Colors.grey.withValues(alpha: 0.4)),
          ),
        ),
        const SizedBox(height: 10),

        Text(
          hasId
              ? 'The variant ID is burnt into the photo so a customer who sends the picture back can be read straight off it.'
              : 'This variant row has no short ID to place, so the picture is stored as it is.',
          style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.4),
        ),

        if (_isUploading) ...[
          const SizedBox(height: 14),
          const LinearProgressIndicator(
            backgroundColor: Color(0x33000000),
            valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
            minHeight: 4,
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              'Uploading picture to storage...',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildStampBadge(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0x9E0F172A), // rgba(15, 23, 42, 0.62)
        borderRadius: BorderRadius.circular(6),
        boxShadow: const [
          BoxShadow(
            color: Color(0x73000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 12,
          fontFamily: 'sans-serif',
        ),
      ),
    );
  }

  Widget _buildStepOneActions() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _currentBytes != null ? () => setState(() => _step = 2) : null,
          child: const Text('Next →'),
        ),
      ],
    );
  }

  Widget _buildStepTwoActions() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        TextButton(
          onPressed: _isUploading ? null : () => setState(() => _step = 1),
          child: const Text('← Back'),
        ),
        ElevatedButton(
          onPressed: _isUploading ? null : _uploadCurrent,
          child: _isUploading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Upload'),
        ),
      ],
    );
  }
}
