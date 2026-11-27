import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../providers/admin_provider.dart';
import '../../../widgets/app_feedback.dart';
import '../../auth/login_screen.dart';
import '../../main_scaffold.dart';

class AdminSettingsScreen extends StatelessWidget {
  const AdminSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final admin = context.watch<AdminProvider>();
    final user = admin.adminUser;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Icon(Icons.settings_outlined, color: AppTheme.primaryColor),
            const SizedBox(width: 8),
            Text(
              'Console Settings',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Administrator account profile and granted capability scopes.',
          style: TextStyle(
            fontSize: 13,
            color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
          ),
        ),
        const SizedBox(height: 16),

        // User Profile Card
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                      child: const Icon(Icons.shield, color: AppTheme.primaryColor, size: 26),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? user?.email ?? 'Administrator',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.email ?? '',
                            style: TextStyle(
                              fontSize: 13,
                              color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: (user?.isSuperuser == true ? Colors.purple : AppTheme.primaryColor)
                            .withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        (user?.role ?? 'admin').toUpperCase(),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: user?.isSuperuser == true ? Colors.purple : AppTheme.primaryColor,
                        ),
                      ),
                    ),
                  ],
                ),
                const Divider(height: 28),
                Text(
                  'Granted Permissions & Capabilities',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: user?.isSuperuser == true
                      ? [
                          Chip(
                            label: const Text('All Capabilities (Superuser)'),
                            backgroundColor: Colors.purple.withValues(alpha: 0.12),
                          ),
                        ]
                      : (user?.capabilities ?? []).map((c) {
                          return Chip(
                            label: Text(c),
                            visualDensity: VisualDensity.compact,
                          );
                        }).toList(),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        _PasswordChangeCard(legacy: user?.legacy == true),
        const SizedBox(height: 20),

        // Session Actions Card
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OutlinedButton.icon(
                  onPressed: () async {
                    await admin.switchToMerchant();
                    if (context.mounted) {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const MainScaffold()),
                        (route) => false,
                      );
                    }
                  },
                  icon: const Icon(Icons.storefront_outlined),
                  label: const Text('Switch to Merchant Business Panel'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: () async {
                    await runWithLogoutProgress(
                      context,
                      (setProgress) => admin.adminLogout(onProgress: setProgress),
                    );
                    if (context.mounted) {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                        (route) => false,
                      );
                    }
                  },
                  icon: const Icon(Icons.logout),
                  label: const Text('Sign Out of Console'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.danger,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PasswordChangeCard extends StatefulWidget {
  final bool legacy;

  const _PasswordChangeCard({required this.legacy});

  @override
  State<_PasswordChangeCard> createState() => _PasswordChangeCardState();
}

class _PasswordChangeCardState extends State<_PasswordChangeCard> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _message;
  bool _error = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _change() async {
    setState(() {
      _message = null;
      _error = false;
    });
    if (_next.text.length < 8 || _next.text != _confirm.text) {
      setState(() {
        _message = _next.text.length < 8
            ? 'The new password must be at least 8 characters.'
            : 'The new passwords do not match.';
        _error = true;
      });
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AdminProvider>().changeConsolePassword(_current.text, _next.text);
      if (!mounted) return;
      setState(() {
        _message = 'Password changed. Other admin sessions were revoked.';
        _error = false;
        _busy = false;
      });
      _current.clear();
      _next.clear();
      _confirm.clear();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.toString().replaceFirst(RegExp(r'^ApiException: '), '');
        _error = true;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.key_outlined, size: 18, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text('Console password',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                    )),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'This changes the password stored in the console admin database, not the legacy Firebase operator account.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
            if (widget.legacy) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'This session uses the legacy environment console password. Its password cannot be changed here; sign in with a DB admin account.',
                  style: TextStyle(fontSize: 11, color: Colors.amber),
                ),
              ),
            ] else ...[
              const SizedBox(height: 12),
              TextField(
                controller: _current,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(
                  labelText: 'Current password',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _next,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'New password',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _confirm,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'Repeat it',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: ElevatedButton(
                  onPressed: _busy ? null : _change,
                  child: Text(_busy ? 'Changing…' : 'Change password'),
                ),
              ),
            ],
            if (_message != null) ...[
              const SizedBox(height: 10),
              Text(_message!,
                  style: TextStyle(fontSize: 12, color: _error ? AppTheme.danger : const Color(0xFF10B981))),
            ],
            const SizedBox(height: 8),
            const Text(
              'The superuser can also reset an admin password from the superuser panel, which revokes that admin’s active sessions.',
              style: TextStyle(fontSize: 10, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
