import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:extended_text_field/extended_text_field.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:image_picker/image_picker.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:pro_image_editor/pro_image_editor.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';

/// Markdown markers are highlighted inside the editable field by
/// extended_text_field, while the same text renders as real HTML via flutter_html.
class _MarkdownSpan extends SpecialText {
  _MarkdownSpan(String flag, TextStyle? style)
      : super(flag, flag, style ?? const TextStyle());

  @override
  InlineSpan finishText() => TextSpan(text: getContent(), style: textStyle);
}

class MarkdownSpanBuilder extends SpecialTextSpanBuilder {
  @override
  SpecialText? createSpecialText(
    String flag, {
    TextStyle? textStyle,
    SpecialTextGestureTapCallback? onTap,
    required int index,
  }) {
    final base = textStyle ?? const TextStyle();
    if (flag.endsWith('__')) {
      return _MarkdownSpan('__', base.copyWith(fontWeight: FontWeight.bold));
    }
    if (flag.endsWith('*')) {
      return _MarkdownSpan('*', base.copyWith(fontStyle: FontStyle.italic));
    }
    if (flag.endsWith('`')) {
      return _MarkdownSpan('`', base.copyWith(
        fontFamily: 'monospace',
        color: Colors.deepOrange,
      ));
    }
    return null;
  }
}

String mailMarkdownToHtml(String markdown) => md.markdownToHtml(markdown);

String mailMarkdownToPlainText(String markdown) {
  var text = markdown
      .replaceAllMapped(
        RegExp(r'\[([^\]]+)\]\(([^)]+)\)'),
        (m) => '${m.group(1)} (${m.group(2)})',
      )
      .replaceAll('__', '')
      .replaceAll('**', '')
      .replaceAll('`', '');
  text = text.replaceAllMapped(RegExp(r'(?m)^\s*#+\s*'), (_) => '');
  text = text.replaceAllMapped(RegExp(r'(?m)^\s*[-*]\s+'), (_) => '');
  return text.trim();
}

class AdminMailComposeScreen extends StatefulWidget {
  final String? replyTo;
  final String? initialSubject;
  final String? initialBody;
  final String? replyId;
  final String? forwardId;

  const AdminMailComposeScreen({
    super.key,
    this.replyTo,
    this.initialSubject,
    this.initialBody,
    this.replyId,
    this.forwardId,
  });

  @override
  State<AdminMailComposeScreen> createState() => _AdminMailComposeScreenState();
}

class _AdminMailComposeScreenState extends State<AdminMailComposeScreen> {
  final _to = TextEditingController();
  final _cc = TextEditingController();
  final _bcc = TextEditingController();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  final List<Map<String, dynamic>> _uploads = [];
  final List<String> _attachmentNames = [];
  bool _isSending = false;
  bool _isPicking = false;
  bool _showPreview = false;

  @override
  void initState() {
    super.initState();
    if (widget.replyTo != null) _to.text = widget.replyTo!;
    if (widget.initialSubject != null) _subject.text = widget.initialSubject!;
    if (widget.initialBody != null) _body.text = widget.initialBody!;
  }

  @override
  void dispose() {
    _to.dispose();
    _cc.dispose();
    _bcc.dispose();
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  List<String> _addresses(String raw) => raw
      .split(RegExp(r'[,;]'))
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toList();

  void _wrapSelection(String marker) {
    final selected = _body.selection;
    final text = _body.text;
    final start = selected.start;
    final end = selected.end;
    final inner = text.substring(start, end);
    final replacement = '$marker$inner$marker';
    _body.text = '${text.substring(0, start)}$replacement${text.substring(end)}';
    _body.selection = TextSelection(
      baseOffset: start + marker.length,
      extentOffset: start + marker.length + inner.length,
    );
    setState(() => _showPreview = false);
  }

  void _prefixLine(String marker) {
    final cursor = _body.selection.start;
    final lineStart = _body.text.lastIndexOf('\n', cursor - 1) + 1;
    _body.text = _body.text.substring(0, lineStart) +
        marker +
        _body.text.substring(lineStart);
    _body.selection = TextSelection.collapsed(offset: cursor + marker.length);
    setState(() => _showPreview = false);
  }

  Future<void> _addAttachment(Map<String, dynamic> signed, String filename) async {
    setState(() {
      _uploads.add(signed);
      _attachmentNames.add(filename);
    });
  }

  Future<void> _pickPhoto() async {
    setState(() => _isPicking = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 90,
      );
      if (picked == null) return;
      Uint8List bytes = await picked.readAsBytes();

      final edited = await Navigator.of(context).push<Uint8List>(
        MaterialPageRoute(
          builder: (_) => ProImageEditor.memory(
            bytes,
            callbacks: ProImageEditorCallbacks(
              onImageEditingComplete: (Uint8List result) async {
                Navigator.of(context).pop(result);
              },
            ),
            configs: const ProImageEditorConfigs(),
          ),
        ),
      );
      if (edited != null) bytes = edited;

      await _uploadBytes(
        bytes: bytes,
        filename: picked.name,
        contentType: 'image/jpeg',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not attach photo: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isPicking = false);
    }
  }

  Future<void> _pickFiles() async {
    setState(() => _isPicking = true);
    try {
      final files = await FilePicker.pickFiles(type: FileType.any);
      for (final file in files) {
        if (file.path == null) continue;
        final bytes = await File(file.path!).readAsBytes();
        await _uploadBytes(
          bytes: bytes,
          filename: file.name,
          contentType: _contentTypeFor(file.name),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not attach file: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isPicking = false);
    }
  }

  String _contentTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.json')) return 'application/json';
    return 'application/octet-stream';
  }

  Future<void> _uploadBytes({
    required Uint8List bytes,
    required String filename,
    required String contentType,
  }) async {
    final admin = context.read<AdminProvider>();
    final signed = await admin.signMailAttachment(
      filename: filename,
      contentType: contentType,
      size: bytes.length,
    );
    await admin.apiService.putBytes(
      signed['uploadUrl'].toString(),
      bytes,
      contentType,
    );
    if (!mounted) return;
    await _addAttachment(signed, signed['filename']?.toString() ?? filename);
  }

  Future<void> _send() async {
    final recipients = _addresses(_to.text);
    final isForward = widget.forwardId != null;
    final isReply = widget.replyId != null;
    if (recipients.isEmpty && !isReply && !isForward) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a recipient')),
      );
      return;
    }
    final html = mailMarkdownToHtml(_body.text);
    final plain = mailMarkdownToPlainText(_body.text);
    if (plain.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please write a message')),
      );
      return;
    }

    setState(() => _isSending = true);
    try {
      final admin = context.read<AdminProvider>();
      if (isReply) {
        await admin.replyEmail(
          widget.replyId!,
          text: plain,
          html: html,
          cc: _addresses(_cc.text),
          bcc: _addresses(_bcc.text),
          uploadedAttachments: _uploads,
        );
      } else if (isForward) {
        await admin.forwardEmail(
          widget.forwardId!,
          to: recipients,
          cc: _addresses(_cc.text),
          bcc: _addresses(_bcc.text),
          text: plain,
          uploadedAttachments: _uploads,
        );
      } else {
        await admin.sendEmail(
          to: recipients,
          cc: _addresses(_cc.text),
          bcc: _addresses(_bcc.text),
          subject: _subject.text.trim(),
          text: plain,
          html: html,
          uploadedAttachments: _uploads,
        );
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  Widget _field(String label, TextEditingController controller, {bool enabled = true}) {
    return TextField(
      controller: controller,
      enabled: enabled,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final isForward = widget.forwardId != null;
    final isReply = widget.replyId != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.forwardId != null
              ? 'Forward message'
              : widget.replyId != null
                  ? 'Reply'
                  : 'Compose message',
        ),
        actions: [
          IconButton(
            onPressed: () => setState(() => _showPreview = !_showPreview),
            icon: Icon(_showPreview ? Icons.edit : Icons.visibility),
            tooltip: _showPreview ? 'Edit' : 'Preview',
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: _isSending ? null : _send,
              icon: const Icon(Icons.send, size: 16),
              label: Text(_isSending ? 'Sending…' : 'Send'),
            ),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        left: false,
        right: false,
        bottom: true,
        child: Padding(
          padding: EdgeInsets.fromLTRB(12, 8, 12, 8 + keyboard),
          child: Column(
            children: [
              _field('To', _to, enabled: !isReply && !isForward),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _field('Cc', _cc)),
                  const SizedBox(width: 8),
                  Expanded(child: _field('Bcc', _bcc)),
                ],
              ),
              const SizedBox(height: 8),
              _field('Subject', _subject, enabled: !isForward && !isReply),
              const SizedBox(height: 8),
              if (!_showPreview)
                Wrap(
                  spacing: 6,
                  children: [
                    IconButton.outlined(
                      onPressed: () => _wrapSelection('__'),
                      icon: const Text('B', style: TextStyle(fontWeight: FontWeight.bold)),
                      tooltip: 'Bold',
                    ),
                    IconButton.outlined(
                      onPressed: () => _wrapSelection('*'),
                      icon: const Text('I', style: TextStyle(fontStyle: FontStyle.italic)),
                      tooltip: 'Italic',
                    ),
                    IconButton.outlined(
                      onPressed: () => _wrapSelection('`'),
                      icon: const Icon(Icons.code, size: 18),
                      tooltip: 'Code',
                    ),
                    IconButton.outlined(
                      onPressed: () => _prefixLine('## '),
                      icon: const Icon(Icons.title, size: 18),
                      tooltip: 'Heading',
                    ),
                    IconButton.outlined(
                      onPressed: () => _prefixLine('- '),
                      icon: const Icon(Icons.format_list_bulleted, size: 18),
                      tooltip: 'Bullet list',
                    ),
                    IconButton.outlined(
                      onPressed: _pickPhoto,
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      tooltip: 'Edit & attach photo',
                    ),
                    IconButton.outlined(
                      onPressed: _pickFiles,
                      icon: const Icon(Icons.attach_file, size: 18),
                      tooltip: 'Attach file',
                    ),
                  ],
                ),
              if (_isPicking)
                const LinearProgressIndicator(minHeight: 2),
              if (_attachmentNames.isNotEmpty)
                SizedBox(
                  height: 44,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _attachmentNames.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) => Chip(
                      avatar: const Icon(Icons.attachment, size: 16),
                      label: Text(_attachmentNames[index], overflow: TextOverflow.ellipsis),
                      onDeleted: () => setState(() {
                        _uploads.removeAt(index);
                        _attachmentNames.removeAt(index);
                      }),
                    ),
                  ),
                ),
              Expanded(
                child: _showPreview
                    ? SingleChildScrollView(
                        child: Html(
                          data: mailMarkdownToHtml(_body.text),
                          style: {
                            'body': Style(
                              color: isDark ? Colors.white70 : Colors.black87,
                              fontSize: FontSize(14),
                            ),
                          },
                        ),
                      )
                    : ExtendedTextField(
                        controller: _body,
                        specialTextSpanBuilder: MarkdownSpanBuilder(),
                        maxLines: null,
                        expands: true,
                        textAlignVertical: TextAlignVertical.top,
                        style: TextStyle(
                          color: isDark ? Colors.white : Colors.black87,
                          fontSize: 14,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Write a message… Markdown formatting is supported.',
                          border: OutlineInputBorder(),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
