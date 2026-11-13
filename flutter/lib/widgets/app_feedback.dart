import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/app_theme.dart';

/// Root messenger so feedback still appears when a screen's own context is being
/// torn down or a callback runs after a route pop.
final GlobalKey<ScaffoldMessengerState> appMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

/// Replaces the grey box Flutter shows in release builds when a screen throws
/// during build. Without this a broken create form looks exactly like a dead
/// button.
class AppBuildErrorWidget extends StatelessWidget {
  final FlutterErrorDetails details;

  const AppBuildErrorWidget({super.key, required this.details});

  @override
  Widget build(BuildContext context) {
    final message = details.exceptionAsString();
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Material(
        color: const Color(0xFFFDECEC),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'This screen failed to load',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFB3261E),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'The action was received but the screen crashed while '
                  'building. Copy the details below and check Diagnostics.',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(fontSize: 12, height: 1.4),
                ),
                const SizedBox(height: 10),
                SelectableText(
                  message,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(
                          text: '$message\n\n${details.stack ?? ''}',
                        ),
                      );
                      showAppSnack('Error details copied');
                    },
                    child: const Text('Copy error'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

void showAppSnack(
  String message, {
  bool isError = false,
  SnackBarAction? action,
}) {
  final messenger = appMessengerKey.currentState;
  if (messenger == null) {
    debugPrint('[Feedback] $message');
    return;
  }
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppTheme.danger : null,
        duration: Duration(seconds: isError ? 6 : 3),
        action: action,
      ),
    );
}

/// A blocking explanation with copyable details. Used instead of a snackbar when
/// a merchant taps a button and the action cannot start, because a snackbar can
/// be missed and cannot carry a stack trace.
Future<void> showProblemDialog(
  BuildContext context, {
  required String title,
  required String message,
  String? fix,
  String? details,
  List<Widget> extraActions = const [],
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) {
      final copyText = [
        title,
        message,
        if (fix != null) fix,
        if (details != null && details.trim().isNotEmpty) details,
      ].join('\n\n');

      return AlertDialog(
        icon: const Icon(Icons.report_problem_outlined, color: AppTheme.danger),
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message, style: const TextStyle(height: 1.4)),
              if (fix != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    fix,
                    style: const TextStyle(fontSize: 12, height: 1.4),
                  ),
                ),
              ],
              if (details != null && details.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text(
                  'Technical details',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: SelectableText(
                    details,
                    style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          ...extraActions,
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: copyText));
              if (ctx.mounted) Navigator.pop(ctx);
              showAppSnack('Error details copied');
            },
            child: const Text('Copy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      );
    },
  );
}
