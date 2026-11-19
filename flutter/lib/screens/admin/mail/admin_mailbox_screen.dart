import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../config/app_theme.dart';
import '../../../models/admin_mail.dart';
import '../../../providers/admin_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/notification_service.dart';

class AdminMailboxScreen extends StatefulWidget {
  const AdminMailboxScreen({super.key});

  @override
  State<AdminMailboxScreen> createState() => _AdminMailboxScreenState();
}

class _AdminMailboxScreenState extends State<AdminMailboxScreen> {
  final _searchController = TextEditingController();
  final _dateFormat = DateFormat('MMM d, h:mm a');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final admin = context.read<AdminProvider>();
      admin.fetchMailbox();
      admin.fetchStorage();
      admin.fetchEmails(refresh: true);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _openComposeDialog({String? replyTo, String? initialSubject, String? initialBody, String? replyId}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ComposeEmailSheet(
        replyTo: replyTo,
        initialSubject: initialSubject,
        initialBody: initialBody,
        replyId: replyId,
      ),
    );
  }

  void _openEmailDetail(MailRow email) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _EmailDetailSheet(
        email: email,
        onReply: (to, subject, body, id) => _openComposeDialog(
          replyTo: to,
          initialSubject: subject,
          initialBody: body,
          replyId: id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final admin = context.watch<AdminProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          await admin.fetchMailbox();
          await admin.fetchStorage();
          await admin.fetchEmails(refresh: true);
        },
        child: Column(
          children: [
            // Top Info Bar (Address & Storage)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1F30) : const Color(0xFFF1F3F9),
                border: Border(
                  bottom: BorderSide(
                    color: isDark ? Colors.white10 : Colors.black12,
                  ),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.mark_email_read_outlined, size: 16, color: AppTheme.primaryColor),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      admin.mailbox?.address ?? admin.adminUser?.email ?? 'System Mailbox',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (admin.storage != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        admin.storage!.formattedUsed,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                  const SizedBox(width: 8),
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => _showNotificationSheet(context),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.notifications_active_outlined, size: 12, color: AppTheme.primaryColor),
                          SizedBox(width: 4),
                          Text('Alerts', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Search Bar & Folder Tabs
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                children: [
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search subject or sender…',
                      prefixIcon: const Icon(Icons.search, size: 18),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 16),
                              onPressed: () {
                                _searchController.clear();
                                admin.fetchEmails(query: '', refresh: true);
                              },
                            )
                          : null,
                      contentPadding: const EdgeInsets.symmetric(vertical: 8),
                      isDense: true,
                    ),
                    onSubmitted: (query) {
                      admin.fetchEmails(query: query.trim(), refresh: true);
                    },
                  ),
                  const SizedBox(height: 10),
                  // Folder selector tabs
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildFolderChip(admin, 'inbox', 'Inbox', Icons.inbox_outlined),
                        const SizedBox(width: 8),
                        _buildFolderChip(admin, 'sent', 'Sent', Icons.send_outlined),
                        const SizedBox(width: 8),
                        _buildFolderChip(admin, 'all', 'All Mail', Icons.mail_outline),
                        const SizedBox(width: 8),
                        _buildFolderChip(admin, 'trash', 'Trash', Icons.delete_outline),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Email List
            Expanded(
              child: admin.isMailLoading && admin.emails.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : admin.emails.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.mail_lock_outlined,
                                size: 54,
                                color: isDark ? Colors.white24 : Colors.black26,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'No messages in ${admin.currentFolder}',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Messages sent or received will appear here.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          itemCount: admin.emails.length,
                          separatorBuilder: (_, __) => Divider(
                            height: 1,
                            color: isDark ? Colors.white10 : Colors.black12,
                          ),
                          itemBuilder: (context, index) {
                            final email = admin.emails[index];
                            final senderInitial = email.isInbound
                                ? (email.from.name.isNotEmpty ? email.from.name[0] : '?').toUpperCase()
                                : (email.toEmail.isNotEmpty ? email.toEmail[0] : '?').toUpperCase();

                            return ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              onTap: () => _openEmailDetail(email),
                              leading: CircleAvatar(
                                radius: 20,
                                backgroundColor: email.isInbound
                                    ? AppTheme.primaryColor.withValues(alpha: 0.15)
                                    : Colors.blue.withValues(alpha: 0.15),
                                child: Text(
                                  senderInitial,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: email.isInbound ? AppTheme.primaryColor : Colors.blue,
                                  ),
                                ),
                              ),
                              title: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      email.isInbound ? email.from.display : 'To: ${email.toEmail}',
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    _dateFormat.format(email.date),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      if (email.hasAttachments) ...[
                                        const Icon(Icons.attach_file, size: 14, color: Colors.grey),
                                        const SizedBox(width: 4),
                                      ],
                                      Expanded(
                                        child: Text(
                                          email.subject.isNotEmpty ? email.subject : '(no subject)',
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w500,
                                            color: isDark ? AppTheme.textDarkPrimary : AppTheme.textLightPrimary,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: email.isTrashed
                                  ? IconButton(
                                      icon: const Icon(Icons.restore, size: 18),
                                      onPressed: () => admin.restoreEmail(email.id),
                                      tooltip: 'Restore',
                                    )
                                  : IconButton(
                                      icon: const Icon(Icons.delete_outline, size: 18),
                                      onPressed: () => admin.trashEmail(email.id),
                                      tooltip: 'Move to trash',
                                    ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openComposeDialog(),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Compose'),
      ),
    );
  }

  Widget _buildFolderChip(AdminProvider admin, String key, String label, IconData icon) {
    final isSelected = admin.currentFolder == key;
    return ChoiceChip(
      avatar: Icon(
        icon,
        size: 16,
        color: isSelected ? Colors.white : AppTheme.primaryColor,
      ),
      label: Text(label),
      selected: isSelected,
      onSelected: (_) {
        admin.fetchEmails(folder: key, refresh: true);
      },
    );
  }

  void _showNotificationSheet(BuildContext context) {
    final apiService = context.read<ApiService>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: isDark ? const Color(0xFF1E1F30) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        bool sending = false;
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.notifications_active_outlined, color: AppTheme.primaryColor),
                        const SizedBox(width: 8),
                        const Text(
                          'Mail Notifications',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => Navigator.of(ctx).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Incoming mail alerts are delivered to this device using Firebase Cloud Messaging.',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: sending
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.send_outlined, size: 18),
                        label: Text(sending ? 'Sending test alert...' : 'Send test alert'),
                        onPressed: sending
                            ? null
                            : () async {
                                setSheetState(() => sending = true);
                                try {
                                  final res = await NotificationService.instance
                                      .sendTestAdminMailPush(apiService);
                                  if (ctx.mounted) {
                                    Navigator.of(ctx).pop();
                                  }
                                  final sent = (res?['sent'] as num?)?.toInt() ?? 0;
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          sent > 0
                                              ? 'Test alert sent ($sent device)! Check notification bar.'
                                              : 'Alert dispatched to registered devices.',
                                        ),
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  setSheetState(() => sending = false);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Failed to send test alert: $e')),
                                    );
                                  }
                                }
                              },
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Re-register this device'),
                        onPressed: () async {
                          Navigator.of(ctx).pop();
                          final ok = await NotificationService.instance
                              .requestAdminMailPush(apiService, requestPermission: true);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  ok
                                      ? 'Device registered for mail alerts.'
                                      : 'Registration failed. Check system notification permission.',
                                ),
                              ),
                            );
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _ComposeEmailSheet extends StatefulWidget {
  final String? replyTo;
  final String? initialSubject;
  final String? initialBody;
  final String? replyId;

  const _ComposeEmailSheet({
    this.replyTo,
    this.initialSubject,
    this.initialBody,
    this.replyId,
  });

  @override
  State<_ComposeEmailSheet> createState() => _ComposeEmailSheetState();
}

class _ComposeEmailSheetState extends State<_ComposeEmailSheet> {
  final _toController = TextEditingController();
  final _ccController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _showCc = false;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    if (widget.replyTo != null) _toController.text = widget.replyTo!;
    if (widget.initialSubject != null) _subjectController.text = widget.initialSubject!;
    if (widget.initialBody != null) _bodyController.text = widget.initialBody!;
  }

  @override
  void dispose() {
    _toController.dispose();
    _ccController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  void _handleSend() async {
    final toText = _toController.text.trim();
    final subject = _subjectController.text.trim();
    final body = _bodyController.text.trim();

    if (toText.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter recipient email')),
      );
      return;
    }
    if (subject.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter subject')),
      );
      return;
    }
    if (body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter message body')),
      );
      return;
    }

    final recipients = toText
        .split(RegExp(r'[,;]'))
        .map((e) => e.trim())
        .filter((e) => e.isNotEmpty)
        .toList();

    final ccList = _ccController.text.trim().isNotEmpty
        ? _ccController.text
            .trim()
            .split(RegExp(r'[,;]'))
            .map((e) => e.trim())
            .filter((e) => e.isNotEmpty)
            .toList()
        : null;

    setState(() => _isSending = true);
    final admin = context.read<AdminProvider>();

    try {
      if (widget.replyId != null) {
        await admin.replyEmail(
          widget.replyId!,
          text: body,
          cc: ccList,
        );
      } else {
        await admin.sendEmail(
          to: recipients,
          cc: ccList,
          subject: subject,
          text: body,
        );
      }

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Message sent successfully'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      padding: EdgeInsets.only(
        top: 16,
        left: 16,
        right: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1F30) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                widget.replyId != null ? 'Reply Message' : 'New Message',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const Divider(),
          // To Field
          TextField(
            controller: _toController,
            decoration: InputDecoration(
              labelText: 'To',
              hintText: 'recipient@domain.com',
              suffixIcon: IconButton(
                icon: Text(
                  _showCc ? 'Cc' : '+Cc',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
                onPressed: () => setState(() => _showCc = !_showCc),
              ),
              border: InputBorder.none,
            ),
          ),
          const Divider(height: 1),
          if (_showCc) ...[
            TextField(
              controller: _ccController,
              decoration: const InputDecoration(
                labelText: 'Cc',
                hintText: 'cc@domain.com',
                border: InputBorder.none,
              ),
            ),
            const Divider(height: 1),
          ],
          // Subject Field
          TextField(
            controller: _subjectController,
            decoration: const InputDecoration(
              labelText: 'Subject',
              hintText: 'Subject line',
              border: InputBorder.none,
            ),
          ),
          const Divider(height: 1),
          // Body Field
          Expanded(
            child: TextField(
              controller: _bodyController,
              maxLines: null,
              expands: true,
              keyboardType: TextInputType.multiline,
              decoration: const InputDecoration(
                hintText: 'Write your message…',
                border: InputBorder.none,
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Send Button
          ElevatedButton.icon(
            onPressed: _isSending ? null : _handleSend,
            icon: _isSending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send),
            label: Text(_isSending ? 'Sending…' : 'Send Message'),
          ),
        ],
      ),
    );
  }
}

class _EmailDetailSheet extends StatefulWidget {
  final MailRow email;
  final Function(String to, String subject, String body, String id) onReply;

  const _EmailDetailSheet({required this.email, required this.onReply});

  @override
  State<_EmailDetailSheet> createState() => _EmailDetailSheetState();
}

class _EmailDetailSheetState extends State<_EmailDetailSheet> {
  MailContent? _content;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  void _loadContent() async {
    final admin = context.read<AdminProvider>();
    final content = await admin.fetchEmailDetail(widget.email.id);
    if (mounted) {
      setState(() {
        _content = content;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final admin = context.read<AdminProvider>();

    return Container(
      height: MediaQuery.of(context).size.height * 0.88,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1F30) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header Bar
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_downward),
                onPressed: () => Navigator.of(context).pop(),
              ),
              Row(
                children: [
                  if (widget.email.isInbound) ...[
                    IconButton(
                      icon: const Icon(Icons.reply),
                      tooltip: 'Reply',
                      onPressed: () {
                        Navigator.of(context).pop();
                        final quote = _content?.text.isNotEmpty == true
                            ? '\n\n---\nOn ${widget.email.date}, ${widget.email.from.display} wrote:\n${_content!.text}'
                            : '';
                        widget.onReply(
                          widget.email.from.email,
                          widget.email.subject.startsWith('Re:')
                              ? widget.email.subject
                              : 'Re: ${widget.email.subject}',
                          quote,
                          widget.email.id,
                        );
                      },
                    ),
                  ],
                  IconButton(
                    icon: Icon(widget.email.isTrashed ? Icons.restore : Icons.delete_outline),
                    tooltip: widget.email.isTrashed ? 'Restore' : 'Trash',
                    onPressed: () async {
                      if (widget.email.isTrashed) {
                        await admin.restoreEmail(widget.email.id);
                      } else {
                        await admin.trashEmail(widget.email.id);
                      }
                      if (context.mounted) Navigator.of(context).pop();
                    },
                  ),
                  if (widget.email.isTrashed) ...[
                    IconButton(
                      icon: const Icon(Icons.delete_forever, color: AppTheme.danger),
                      tooltip: 'Delete permanently',
                      onPressed: () async {
                        await admin.deleteEmail(widget.email.id);
                        if (context.mounted) Navigator.of(context).pop();
                      },
                    ),
                  ],
                ],
              ),
            ],
          ),
          const Divider(),
          // Subject
          Text(
            widget.email.subject.isNotEmpty ? widget.email.subject : '(no subject)',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          // Sender & Recipient Chips
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.15),
                child: Text(
                  (widget.email.from.name.isNotEmpty ? widget.email.from.name[0] : '?').toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.email.from.display,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      'To: ${widget.email.toEmail}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppTheme.textDarkSecondary : AppTheme.textLightSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(),
          // Content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Attachments list
                        if (_content?.attachments.isNotEmpty == true) ...[
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.04),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.attach_file, size: 14),
                                    const SizedBox(width: 6),
                                    Text(
                                      '${_content!.attachments.length} Attachments',
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                ..._content!.attachments.map((a) => Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.insert_drive_file_outlined, size: 14),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: Text(
                                              a.filename,
                                              style: const TextStyle(fontSize: 12),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Text(
                                            a.formattedSize,
                                            style: const TextStyle(fontSize: 11, color: Colors.grey),
                                          ),
                                        ],
                                      ),
                                    )),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        // Body Text
                        SelectableText(
                          _content?.text.isNotEmpty == true
                              ? _content!.text
                              : '(No plain text content available)',
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
extension _ListFilter<T> on Iterable<T> {
  Iterable<T> filter(bool Function(T) test) => where(test);
}
