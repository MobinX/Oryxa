import 'package:flutter/material.dart';

/// Wraps a tab-body widget so it can be pushed as a standalone route.
///
/// Several merchant screens (InboxScreen, OrdersScreen, ...) are built as the
/// body of MainScaffold and intentionally have no Scaffold of their own. Pushing
/// them directly leaves Text without a Material/DefaultTextStyle ancestor (the
/// red-with-yellow-underline error style) and draws under the Android nav bar.
/// This gives those pushed routes the scaffold and bottom safe area they need
/// while leaving their embedded use in MainScaffold unchanged.
class StandaloneTabPage extends StatelessWidget {
  final String title;
  final Widget child;

  const StandaloneTabPage({
    super.key,
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        top: false,
        left: false,
        right: false,
        bottom: true,
        child: child,
      ),
    );
  }
}
