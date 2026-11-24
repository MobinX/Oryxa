import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Renders an email's HTML body with Flutter widgets only. No web view or native
/// plugin is involved, so the OTA patcher never sees a native dependency change.
///
/// It handles the formatting mail clients actually use in practice: bold, italic,
/// underline, links, headings, lists, line breaks and inline <img> downloads.
class EmailHtmlView extends StatelessWidget {
  final String html;
  final TextStyle? baseStyle;

  const EmailHtmlView({
    super.key,
    required this.html,
    this.baseStyle,
  });

  static String decodeEntities(String value) {
    var text = value
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
    text = text.replaceAllMapped(RegExp(r'&#(\d+);'), (m) {
      final code = int.tryParse(m.group(1)!);
      return code == null ? m.group(0)! : String.fromCharCode(code);
    });
    text = text.replaceAllMapped(RegExp(r'&#x([0-9a-fA-F]+);'), (m) {
      final code = int.tryParse(m.group(1)!, radix: 16);
      return code == null ? m.group(0)! : String.fromCharCode(code);
    });
    return text;
  }

  /// Strips the parts of a marketing email that are styling/metadata rather
  /// than visible content: comments (incl. Outlook conditional ones), style,
  /// script, head, title, doctype, meta and link blocks. Without this, raw CSS
  /// such as `@import url(...)` and `@font-face { ... }` shows up as text.
  static String sanitize(String html) {
    var out = html.replaceAll(RegExp(r'<!--[\s\S]*?-->'), ' ');
    for (final block in const ['style', 'script', 'head', 'title']) {
      out = out.replaceAll(
        RegExp('<' + block + r'\b[^>]*>[\s\S]*?</' + block + r'\s*>', caseSensitive: false),
        ' ',
      );
    }
    out = out.replaceAll(RegExp(r'<!DOCTYPE[^>]*>', caseSensitive: false), ' ');
    out = out.replaceAll(
      RegExp(r'<(meta|link)\b[^>]*>', caseSensitive: false),
      ' ',
    );
    return out;
  }

  static final RegExp _tag = RegExp(r'(</?[a-zA-Z][^>]*>)|([^<]+)', multiLine: true);
  static final RegExp _image = RegExp(r'<img[^>]*>', caseSensitive: false);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = baseStyle ?? TextStyle(
      fontSize: 13.5,
      height: 1.45,
      color: isDark ? Colors.white70 : Colors.black87,
    );

    final clean = sanitize(html);
    final children = <Widget>[];
    final imageMatches = _image.allMatches(clean);
    var cursor = 0;
    for (final match in imageMatches) {
      if (match.start > cursor) {
        children.addAll(_richSegments(clean.substring(cursor, match.start), base));
      }
      final tag = match.group(0) ?? '';
      final src = _attribute(tag, 'src');
      if (src != null && src.isNotEmpty) {
        children.add(_imageWidget(src, base));
      }
      cursor = match.end;
    }
    if (cursor < clean.length) {
      children.addAll(_richSegments(clean.substring(cursor), base));
    }
    if (children.isEmpty) {
      children.add(const Text('(empty message)'));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    );
  }

  Widget _imageWidget(String src, TextStyle base) {
    final uri = Uri.tryParse(src);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          src,
          width: double.infinity,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.grey.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Image could not be loaded${uri != null ? ': $src' : ''}',
              style: base.copyWith(fontSize: 11, color: Colors.grey),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _richSegments(String fragment, TextStyle base) {
    bool bold = false;
    bool italic = false;
    bool underline = false;
    String? link;
    final spans = <InlineSpan>[];
    final buffer = StringBuffer();

    void flush() {
      if (buffer.isEmpty) return;
      spans.add(TextSpan(
        text: decodeEntities(buffer.toString()),
        style: base.copyWith(
          fontWeight: bold ? FontWeight.bold : null,
          fontStyle: italic ? FontStyle.italic : null,
          decoration: underline ? TextDecoration.underline : null,
          color: link != null ? Colors.indigo : null,
        ),
        recognizer: link == null
            ? null
            : (TapGestureRecognizer()
              ..onTap = () async {
                final uri = Uri.tryParse(link!);
                if (uri != null && await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              }),
      ));
      buffer.clear();
    }

    for (final match in _tag.allMatches(fragment)) {
      final tag = match.group(1);
      if (tag == null) {
        buffer.write(match.group(2) ?? '');
        continue;
      }
      flush();
      final lower = tag.toLowerCase();
      if (lower.startsWith('</')) {
        if (lower.contains('b') || lower.contains('strong') || lower.contains('h1') || lower.contains('h2')) {
          bold = false;
        }
        if (lower.contains('i') || lower.contains('em')) italic = false;
        if (lower.contains('u') || lower.contains('a')) {
          underline = false;
          link = null;
        }
        continue;
      }
      if (lower.startsWith('<br') ||
          lower.startsWith('<p') ||
          lower.startsWith('<div') ||
          lower.startsWith('<li') ||
          lower.startsWith('<tr')) {
        spans.add(const TextSpan(text: '\n'));
      }
      if (lower.startsWith('<b') || lower.startsWith('<strong') ||
          lower.startsWith('<h1') || lower.startsWith('<h2') || lower.startsWith('<h3')) {
        bold = true;
      }
      if (lower.startsWith('<i') || lower.startsWith('<em')) italic = true;
      if (lower.startsWith('<u')) underline = true;
      if (lower.startsWith('<a')) {
        link = _attribute(tag, 'href');
        underline = true;
      }
    }
    flush();

    if (spans.isEmpty) return const [];

    return [
      RichText(
        text: TextSpan(style: base, children: spans),
        textAlign: TextAlign.start,
      ),
    ];
  }

  static String? _attribute(String tag, String name) {
    final match = RegExp(
      '$name\\s*=\\s*["\']([^"\']+)["\']',
      caseSensitive: false,
    ).firstMatch(tag);
    return match?.group(1);
  }
}
