import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../models/conversation.dart';
import '../../models/playground.dart';
import '../../providers/business_provider.dart';
import '../../services/api_service.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_feedback.dart';

class PlaygroundScreen extends StatefulWidget {
  const PlaygroundScreen({super.key});

  @override
  State<PlaygroundScreen> createState() => _PlaygroundScreenState();
}

class _PlaygroundScreenState extends State<PlaygroundScreen> {
  static const List<String> _mockNames = [
    'Oliver Queen',
    'Bruce Wayne',
    'Diana Prince',
    'Barry Allen',
    'Clark Kent',
    'Kara Danvers',
    'Tony Stark',
    'Peter Parker',
    'Selina Kyle',
    'Arthur Curry',
  ];

  final _messageController = TextEditingController();
  final _commenterNameController = TextEditingController(text: 'Ariana Rahman');
  final _historyController = TextEditingController();
  final _commentTextController = TextEditingController();
  final _chatScrollController = ScrollController();
  final _commentScrollController = ScrollController();

  bool _loadingSandbox = true;
  bool _commentMode = false; // false = Messenger chat, true = Page comment
  ChannelModel? _activeChannel;
  List<ConversationModel> _conversations = [];
  String? _selectedConvId;
  List<MessageModel> _messages = [];
  bool _loadingMessages = false;
  String? _chatLoadError;

  AgentModel? _agent;
  bool _isChatRunning = false;
  bool _isCommentRunning = false;
  final List<PlaygroundLogEvent> _logs = [];
  final List<PlaygroundTraceMessage> _trace = [];
  final List<CommentThreadItem> _commentThread = [];
  final List<Map<String, String>> _pendingPhotos = []; // [{'key': ..., 'url': ...}]
  bool _uploadingPhoto = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadSandbox());
  }

  @override
  void dispose() {
    _messageController.dispose();
    _commenterNameController.dispose();
    _historyController.dispose();
    _commentTextController.dispose();
    _chatScrollController.dispose();
    _commentScrollController.dispose();
    super.dispose();
  }

  String _sandboxPageId(String businessId) => 'mock-channel-$businessId';

  Future<void> _loadSandbox() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) {
      setState(() => _loadingSandbox = false);
      return;
    }

    setState(() => _loadingSandbox = true);
    final api = context.read<ApiService>();

    try {
      // 1. Load or provision sandbox channel
      final channelsRes = await api.get(ApiConfig.pathChannels(biz.id));
      List<ChannelModel> channelList = [];
      if (channelsRes is List) {
        channelList = channelsRes
            .whereType<Map>()
            .map((c) => ChannelModel.fromJson(Map<String, dynamic>.from(c)))
            .toList();
      }

      final pageId = _sandboxPageId(biz.id);
      ChannelModel? sandbox = channelList.firstWhere(
        (c) => c.platformChannelId == pageId,
        orElse: () => ChannelModel(id: '', businessId: biz.id, platform: 'facebook'),
      );

      if (sandbox.id.isEmpty) {
        final createRes = await api.post(
          ApiConfig.pathChannels(biz.id),
          body: {
            'platform': 'facebook',
            'apiToken': 'mock-test-token',
            'platformChannelId': pageId,
            'extraInfo': jsonEncode({'pageName': 'Sandbox Testing Page'}),
          },
        );
        if (createRes is Map && createRes['id'] != null) {
          sandbox = ChannelModel.fromJson(Map<String, dynamic>.from(createRes));
        }
      }

      _activeChannel = sandbox.id.isNotEmpty ? sandbox : null;

      // 2. Load default agent
      try {
        final agentRes = await api.get(ApiConfig.pathDefaultAgent(biz.id));
        if (agentRes is Map) {
          _agent = AgentModel.fromJson(Map<String, dynamic>.from(agentRes));
        }
      } catch (e) {
        debugPrint('[Playground] Default agent load error: $e');
      }

      // 3. Load conversations for sandbox channel
      if (_activeChannel != null) {
        await _loadConversations();
      }
    } catch (e) {
      appDiagnostics.recordMessage('Playground', 'Failed to load sandbox: $e');
      if (mounted) {
        showAppSnack('Could not load sandbox: $e', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _loadingSandbox = false);
      }
    }
  }

  Future<void> _loadConversations() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final channel = _activeChannel;
    if (biz == null || channel == null) return;

    final api = context.read<ApiService>();
    try {
      final res = await api.get(
        ApiConfig.pathConversations(biz.id, channelId: channel.id, limit: 50),
      );
      if (res is List) {
        final convs = res
            .whereType<Map>()
            .map((c) => ConversationModel.fromJson(Map<String, dynamic>.from(c)))
            .where((c) => c.channelId == channel.id)
            .toList();

        setState(() {
          _conversations = convs;
          if (_selectedConvId == null && convs.isNotEmpty) {
            _selectedConvId = convs.first.id;
          }
        });

        if (_selectedConvId != null) {
          await _loadMessages(_selectedConvId!);
        }
      }
    } catch (e) {
      debugPrint('[Playground] Load conversations error: $e');
    }
  }

  Future<void> _loadMessages(String convId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    setState(() {
      _loadingMessages = true;
      _chatLoadError = null;
    });

    final api = context.read<ApiService>();
    try {
      final res = await api.get(ApiConfig.pathMessages(biz.id, convId));
      if (res is List) {
        final msgs = res
            .whereType<Map>()
            .map((m) => MessageModel.fromJson(Map<String, dynamic>.from(m), conversationId: convId))
            .toList();

        if (mounted && _selectedConvId == convId) {
          setState(() {
            _messages = msgs;
            _loadingMessages = false;
          });
          _scrollChatToBottom();
        }
      }
    } catch (e) {
      if (mounted && _selectedConvId == convId) {
        setState(() {
          _chatLoadError = e.toString();
          _loadingMessages = false;
        });
      }
    }
  }

  void _scrollChatToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _scrollCommentToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_commentScrollController.hasClients) {
        _commentScrollController.animateTo(
          _commentScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _addLog(String event, dynamic data) {
    final now = DateTime.now();
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    final log = PlaygroundLogEvent(
      id: '${now.millisecondsSinceEpoch}-${Random().nextInt(1000)}',
      event: event,
      timestamp: timeStr,
      data: data,
    );
    setState(() {
      _logs.add(log);
    });
  }

  Future<void> _handleCreateChat() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final channel = _activeChannel;
    if (biz == null || channel == null || _isChatRunning) return;

    final randomName = _mockNames[Random().nextInt(_mockNames.length)];
    final testUserId = 'test-user-${DateTime.now().millisecondsSinceEpoch}';

    setState(() {
      _isChatRunning = true;
      _logs.clear();
      _trace.clear();
    });

    final api = context.read<ApiService>();
    String? createdConvId;

    try {
      final stream = api.streamSse(
        ApiConfig.pathPlaygroundTestRun(biz.id),
        body: {
          'channelId': channel.id,
          'userMessage': 'Hello! I am $randomName.',
          'testUserId': testUserId,
        },
      );

      await for (final entry in stream) {
        final event = entry.key;
        final data = entry.value;

        if (event == 'trace') {
          _addLog(event, {'count': data is Map && data['messages'] is List ? (data['messages'] as List).length : 0});
          if (data is Map && data['messages'] is List) {
            setState(() {
              _trace = (data['messages'] as List)
                  .whereType<Map>()
                  .map((m) => PlaygroundTraceMessage.fromJson(Map<String, dynamic>.from(m)))
                  .toList();
            });
          }
        } else {
          _addLog(event, data);
        }

        if (event == 'conversation_ready' && data is Map && data['conversationId'] != null) {
          createdConvId = data['conversationId'].toString();
          setState(() {
            _selectedConvId = createdConvId;
          });
        }
      }

      await _loadConversations();
      if (createdConvId != null) {
        await _loadMessages(createdConvId);
      }
    } catch (e) {
      appDiagnostics.recordMessage('Playground', 'Failed to seed new chat: $e');
      _addLog('error', {'message': e.toString()});
      if (mounted) {
        showAppSnack('Failed to start chat: $e', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _isChatRunning = false);
      }
    }
  }

  Future<void> _handleSendMessage() async {
    final userMessage = _messageController.text.trim();
    final photos = List<Map<String, String>>.from(_pendingPhotos);
    final biz = context.read<BusinessProvider>().currentBusiness;
    final channel = _activeChannel;
    final convId = _selectedConvId;

    if ((userMessage.isEmpty && photos.isEmpty) || biz == null || channel == null || convId == null || _isChatRunning) {
      return;
    }

    _messageController.clear();
    setState(() {
      _pendingPhotos.clear();
      _isChatRunning = true;
      _logs.clear();
      _trace.clear();

      // Optimistic user message bubble
      _messages.add(
        MessageModel(
          id: 'temp-${DateTime.now().millisecondsSinceEpoch}',
          conversationId: convId,
          from: 'customer',
          content: userMessage,
          images: photos.map((p) => p['url']!).toList(),
          time: DateTime.now(),
        ),
      );
    });
    _scrollChatToBottom();

    final activeConv = _conversations.firstWhere(
      (c) => c.id == convId,
      orElse: () => ConversationModel(id: convId, lastMessageState: 'done'),
    );
    final testUserId = activeConv.customerPlatformId ?? 'test-user-$convId';
    final api = context.read<ApiService>();

    try {
      final stream = api.streamSse(
        ApiConfig.pathPlaygroundTestRun(biz.id),
        body: {
          'channelId': channel.id,
          'userMessage': userMessage,
          'imageKeys': photos.map((p) => p['key']!).toList(),
          'testUserId': testUserId,
        },
      );

      await for (final entry in stream) {
        final event = entry.key;
        final data = entry.value;

        if (event == 'trace') {
          _addLog(event, {'count': data is Map && data['messages'] is List ? (data['messages'] as List).length : 0});
          if (data is Map && data['messages'] is List) {
            setState(() {
              _trace = (data['messages'] as List)
                  .whereType<Map>()
                  .map((m) => PlaygroundTraceMessage.fromJson(Map<String, dynamic>.from(m)))
                  .toList();
            });
          }
        } else {
          _addLog(event, data);
        }
      }

      await _loadMessages(convId);
    } catch (e) {
      appDiagnostics.recordMessage('Playground', 'Failed during agent test run: $e');
      _addLog('error', {'message': e.toString()});
      if (mounted) {
        showAppSnack('Agent run failed: $e', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _isChatRunning = false);
      }
    }
  }

  Future<void> _handleRunComment() async {
    final comment = _commentTextController.text.trim();
    final biz = context.read<BusinessProvider>().currentBusiness;
    final channel = _activeChannel;

    if (comment.isEmpty || biz == null || channel == null || _isCommentRunning) return;

    final commenterName = _commenterNameController.text.trim().isNotEmpty
        ? _commenterNameController.text.trim()
        : 'Ariana Rahman';
    final historyText = _historyController.text.trim();

    // Parse comment history lines: line with "page:" is self, else customer
    final history = historyText
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .take(20)
        .map((l) {
          final isPage = RegExp(r'^page:\s*', caseSensitive: false).hasMatch(l);
          return {
            'from': isPage ? 'self' : 'customer',
            'content': l.replaceFirst(RegExp(r'^page:\s*', caseSensitive: false), ''),
          };
        })
        .where((row) => row['content']!.isNotEmpty)
        .toList();

    _commentTextController.clear();
    final now = DateTime.now();

    setState(() {
      _isCommentRunning = true;
      _logs.clear();
      _trace.clear();

      _commentThread.clear();
      for (int i = 0; i < history.length; i++) {
        final row = history[i];
        _commentThread.add(
          CommentThreadItem(
            id: 'history-$i',
            from: row['from']!,
            content: row['content']!,
            kind: row['from'] == 'self' ? 'reply' : 'comment',
            time: now,
          ),
        );
      }
      _commentThread.add(
        CommentThreadItem(
          id: 'current-${now.millisecondsSinceEpoch}',
          from: 'customer',
          content: comment,
          kind: 'comment',
          time: now,
        ),
      );
    });
    _scrollCommentToBottom();

    final api = context.read<ApiService>();

    try {
      final stream = api.streamSse(
        ApiConfig.pathPlaygroundCommentTestRun(biz.id),
        body: {
          'channelId': channel.id,
          'comment': comment,
          'history': history,
          'commenterName': commenterName,
        },
      );

      await for (final entry in stream) {
        final event = entry.key;
        final data = entry.value;

        _addLog(event, data);

        if (event == 'comment_replied' && data is Map && data['text'] != null) {
          setState(() {
            _commentThread.add(
              CommentThreadItem(
                id: 'reply-${DateTime.now().millisecondsSinceEpoch}',
                from: 'self',
                content: data['text'].toString(),
                kind: 'reply',
                time: DateTime.now(),
              ),
            );
          });
          _scrollCommentToBottom();
        } else if (event == 'private_message_sent' && data is Map && data['text'] != null) {
          setState(() {
            _commentThread.add(
              CommentThreadItem(
                id: 'dm-${DateTime.now().millisecondsSinceEpoch}',
                from: 'self',
                content: data['text'].toString(),
                kind: 'dm',
                time: DateTime.now(),
              ),
            );
          });
          _scrollCommentToBottom();
        } else if (event == 'no_reply' && data is Map) {
          final isSilent = data['silent'] == true;
          final finalMsg = isSilent
              ? 'Stayed silent — no comment reply, no Messenger message.'
              : 'No tool called. Final text: ${data['text'] ?? '(empty)'}';
          setState(() {
            _commentThread.add(
              CommentThreadItem(
                id: 'silent-${DateTime.now().millisecondsSinceEpoch}',
                from: 'self',
                content: finalMsg,
                kind: 'reply',
                time: DateTime.now(),
              ),
            );
          });
          _scrollCommentToBottom();
        } else if (event == 'error' && data is Map) {
          setState(() {
            _commentThread.add(
              CommentThreadItem(
                id: 'err-${DateTime.now().millisecondsSinceEpoch}',
                from: 'self',
                content: 'Error: ${data['message'] ?? 'Comment agent failed'}',
                kind: 'reply',
                time: DateTime.now(),
              ),
            );
          });
          _scrollCommentToBottom();
        }
      }
    } catch (e) {
      appDiagnostics.recordMessage('Playground', 'Comment run failed: $e');
      _addLog('error', {'message': e.toString()});
      setState(() {
        _commentThread.add(
          CommentThreadItem(
            id: 'err-${DateTime.now().millisecondsSinceEpoch}',
            from: 'self',
            content: 'Run failed: $e',
            kind: 'reply',
            time: DateTime.now(),
          ),
        );
      });
    } finally {
      if (mounted) {
        setState(() => _isCommentRunning = false);
      }
    }
  }

  Future<void> _handleDeleteChat(String convId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Test Chat?'),
        content: const Text(
          'Are you sure you want to hard delete this conversation? '
          'This will permanently wipe all messages from the database.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppTheme.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    final api = context.read<ApiService>();
    try {
      await api.delete(ApiConfig.pathConversationDetail(biz.id, convId));
      setState(() {
        _conversations.removeWhere((c) => c.id == convId);
        if (_selectedConvId == convId) {
          _selectedConvId = _conversations.isNotEmpty ? _conversations.first.id : null;
          _messages.clear();
        }
      });
      if (_selectedConvId != null) {
        await _loadMessages(_selectedConvId!);
      }
      _addLog('conversation_hard_deleted', {'conversationId': convId});
    } catch (e) {
      showAppSnack('Failed to delete conversation: $e', isError: true);
    }
  }

  Future<void> _attachPhoto() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _pendingPhotos.length >= 4) return;

    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Attach Test Photo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: AppTheme.primaryColor),
                title: const Text('Choose from Gallery'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined, color: AppTheme.primaryColor),
                title: const Text('Take with Camera'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
            ],
          ),
        ),
      ),
    );

    if (source == null || !mounted) return;

    final picked = await picker.pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 85);
    if (picked == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    final bytes = await picked.readAsBytes();
    final api = context.read<ApiService>();

    try {
      final filename = 'test_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final res = await api.uploadVariantImage(businessId: biz.id, bytes: bytes, filename: filename);
      final key = res['key'] ?? '';
      final url = res['url'] ?? key;
      if (mounted && key.isNotEmpty) {
        setState(() {
          _pendingPhotos.add({'key': key, 'url': url});
        });
      }
    } catch (e) {
      if (mounted) {
        showAppSnack('Could not upload photo: $e', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _uploadingPhoto = false);
      }
    }
  }

  void _showConversationsSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final isDark = Theme.of(ctx).brightness == Brightness.dark;
            return Container(
              height: MediaQuery.of(ctx).size.height * 0.7,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      const Text('Test Conversations', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _handleCreateChat();
                        },
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('New Chat'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (_conversations.isEmpty)
                    const Expanded(
                      child: Center(
                        child: Text(
                          'No active test sessions.\nTap "New Chat" to seed one.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        itemCount: _conversations.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, index) {
                          final conv = _conversations[index];
                          final isSelected = conv.id == _selectedConvId;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            selected: isSelected,
                            selectedTileColor: AppTheme.primaryColor.withOpacity(0.08),
                            leading: CircleAvatar(
                              backgroundColor: isSelected ? AppTheme.primaryColor : (isDark ? Colors.grey.shade800 : Colors.grey.shade200),
                              child: Text(
                                conv.initials,
                                style: TextStyle(
                                  color: isSelected ? Colors.white : (isDark ? Colors.white : Colors.black87),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            title: Text(conv.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            subtitle: Text(
                              conv.customerPlatformId ?? conv.id,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18, color: Colors.grey),
                              onPressed: () async {
                                await _handleDeleteChat(conv.id);
                                setSheetState(() {});
                              },
                            ),
                            onTap: () {
                              setState(() {
                                _selectedConvId = conv.id;
                              });
                              _loadMessages(conv.id);
                              Navigator.pop(ctx);
                            },
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showLogsSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F111A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Container(
              height: MediaQuery.of(ctx).size.height * 0.75,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.terminal, color: Colors.indigoAccent, size: 20),
                          SizedBox(width: 8),
                          Text(
                            'Live SSE Execution Trace',
                            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.clear_all, color: Colors.grey, size: 20),
                        tooltip: 'Clear logs',
                        onPressed: () {
                          setState(() => _logs.clear());
                          setSheetState(() {});
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (_logs.isEmpty)
                    const Expanded(
                      child: Center(
                        child: Text(
                          'No active logs yet.\nSend a message to stream live traces.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white54, fontSize: 12, fontFamily: 'monospace'),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        itemCount: _logs.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (ctx, index) {
                          final log = _logs[index];
                          return _buildLogCard(log);
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildLogCard(PlaygroundLogEvent log) {
    Color badgeBg = Colors.white10;
    Color badgeColor = Colors.white70;
    String label = log.event;

    if (log.event == 'runner_start' || log.event == 'agent_start') {
      badgeBg = Colors.blue.withOpacity(0.2);
      badgeColor = Colors.lightBlueAccent;
    } else if (log.event == 'tool_call') {
      badgeBg = Colors.amber.withOpacity(0.2);
      badgeColor = Colors.amberAccent;
      label = 'tool_call: ${log.data is Map ? log.data['name'] : ''}';
    } else if (log.event == 'tool_result') {
      badgeBg = Colors.green.withOpacity(0.2);
      badgeColor = Colors.greenAccent;
      label = 'tool_result: ${log.data is Map ? log.data['name'] : ''}';
    } else if (log.event == 'comment_replied') {
      badgeBg = Colors.indigo.withOpacity(0.3);
      badgeColor = Colors.indigoAccent;
      label = 'comment_replied (public)';
    } else if (log.event == 'private_message_sent') {
      badgeBg = Colors.teal.withOpacity(0.2);
      badgeColor = Colors.tealAccent;
      label = 'private_message_sent (Messenger)';
    } else if (log.event == 'message_sent' || log.event == 'reply') {
      badgeBg = Colors.cyan.withOpacity(0.2);
      badgeColor = Colors.cyanAccent;
    } else if (log.event == 'done' || log.event == 'runner_done') {
      badgeBg = Colors.purple.withOpacity(0.2);
      badgeColor = Colors.purpleAccent;
    } else if (log.event == 'error' || log.event == 'runner_error') {
      badgeBg = Colors.red.withOpacity(0.2);
      badgeColor = Colors.redAccent;
    }

    return InkWell(
      onTap: () => _showLogDetailDialog(log),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          border: Border.all(color: Colors.white12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.between,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: badgeBg, borderRadius: BorderRadius.circular(4)),
                  child: Text(
                    label,
                    style: TextStyle(color: badgeColor, fontSize: 10, fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                  ),
                ),
                Text(log.timestamp, style: const TextStyle(color: Colors.white38, fontSize: 9, fontFamily: 'monospace')),
              ],
            ),
            const SizedBox(height: 6),
            if (log.event == 'tool_call' && log.data is Map)
              Text('args: ${jsonEncode(log.data['args'])}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.amberAccent, fontSize: 10, fontFamily: 'monospace'))
            else if (log.event == 'tool_result' && log.data is Map)
              Text('res: ${log.data['result']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.greenAccent, fontSize: 10, fontFamily: 'monospace'))
            else if ((log.event == 'message_sent' || log.event == 'comment_replied' || log.event == 'private_message_sent') && log.data is Map)
              Text('text: "${log.data['text']}"', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.cyanAccent, fontSize: 10, fontFamily: 'monospace'))
            else if (log.event == 'done' && log.data is Map && log.data['metrics'] != null)
              Text(
                'Tokens: ${(log.data['metrics']['totalTokens'] ?? 0)} · Cache: ${log.data['metrics']['cacheHitPercent']}% · ${log.data['metrics']['latencyMs']}ms',
                style: const TextStyle(color: Colors.purpleAccent, fontSize: 10, fontFamily: 'monospace'),
              )
            else
              Text(jsonEncode(log.data), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 10, fontFamily: 'monospace')),
          ],
        ),
      ),
    );
  }

  void _showLogDetailDialog(PlaygroundLogEvent log) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF141824),
        title: Text(log.event, style: const TextStyle(color: Colors.white, fontSize: 15, fontFamily: 'monospace')),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: SelectableText(
              const JsonEncoder.withIndent('  ').convert(log.data),
              style: const TextStyle(color: Colors.greenAccent, fontSize: 11, fontFamily: 'monospace'),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close', style: TextStyle(color: Colors.white70)),
          ),
        ],
      ),
    );
  }

  void _showTokenAnalysisSheet() {
    int totalIn = 0;
    int totalOut = 0;
    int totalCache = 0;

    for (final t in _trace) {
      if (t.usage != null) {
        totalIn += t.usage!.inputTokens;
        totalOut += t.usage!.outputTokens;
        totalCache += t.usage!.cacheReadTokens;
      }
    }

    final totalTokens = totalIn + totalOut;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return Container(
          height: MediaQuery.of(ctx).size.height * 0.75,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 12),
              const Text('Token Analysis & Transcript', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _statCard('In', totalIn.toString(), Colors.blue),
                  const SizedBox(width: 8),
                  _statCard('Out', totalOut.toString(), Colors.purple),
                  const SizedBox(width: 8),
                  _statCard('Cache', totalCache.toString(), Colors.green),
                  const SizedBox(width: 8),
                  _statCard('Total', totalTokens.toString(), isDark ? Colors.white : Colors.black87),
                ],
              ),
              const SizedBox(height: 16),
              const Text('Turn-by-Turn Inspection', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              if (_trace.isEmpty)
                const Expanded(
                  child: Center(
                    child: Text(
                      'The transcript lands here when a run finishes —\nevery message the model saw and what each call charged.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: _trace.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, index) {
                      final item = _trace[index];
                      return Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isDark ? AppTheme.cardDark : Colors.grey.shade50,
                          border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.between,
                              children: [
                                Text(
                                  item.role.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: item.role == 'ai'
                                        ? AppTheme.primaryColor
                                        : item.role == 'tool'
                                            ? Colors.green
                                            : Colors.grey,
                                  ),
                                ),
                                if (item.usage != null)
                                  Text(
                                    '${item.usage!.totalTokens} tokens',
                                    style: const TextStyle(fontSize: 9, fontFamily: 'monospace', color: Colors.grey),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            SelectableText(
                              item.content.isNotEmpty ? item.content : (item.toolCalls.isNotEmpty ? 'Tool calls: ${item.toolCalls.map((c) => c.name).join(', ')}' : ''),
                              style: const TextStyle(fontSize: 11),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          children: [
            Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }

  void _showAgentPromptDialog() {
    final agent = _agent;
    if (agent == null) return;

    final promptCtrl = TextEditingController(text: agent.systemPrompt ?? '');
    final messengerCtrl = TextEditingController(text: agent.replyGuidance ?? agent.defaultReplyGuidance ?? '');
    final commentCtrl = TextEditingController(text: agent.commentReplyGuidance ?? agent.defaultCommentReplyGuidance ?? '');
    bool saving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
              child: Container(
                height: MediaQuery.of(ctx).size.height * 0.8,
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(2)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.between,
                      children: [
                        const Text('Agent Prompt & Guidance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        ElevatedButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  setSheetState(() => saving = true);
                                  final biz = context.read<BusinessProvider>().currentBusiness;
                                  if (biz != null) {
                                    try {
                                      final api = context.read<ApiService>();
                                      final payload = {
                                        'systemPrompt': promptCtrl.text.trim(),
                                        'replyGuidance': messengerCtrl.text.trim(),
                                        'commentReplyGuidance': commentCtrl.text.trim(),
                                      };
                                      await api.patch(ApiConfig.pathAgentDetail(biz.id, agent.id), body: payload);
                                      setState(() {
                                        _agent = agent.copyWith(
                                          systemPrompt: promptCtrl.text.trim(),
                                          replyGuidance: messengerCtrl.text.trim(),
                                          commentReplyGuidance: commentCtrl.text.trim(),
                                          followsDefault: false,
                                        );
                                      });
                                      if (mounted) {
                                        showAppSnack('Prompt & Guidance saved');
                                        Navigator.pop(ctx);
                                      }
                                    } catch (e) {
                                      setSheetState(() => saving = false);
                                      showAppSnack('Save failed: $e', isError: true);
                                    }
                                  }
                                },
                          child: saving ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: ListView(
                        children: [
                          const Text('System Prompt', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          TextField(
                            controller: promptCtrl,
                            maxLines: 8,
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                            decoration: InputDecoration(
                              hintText: "Enter the assistant's instructions...",
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text('Messenger Reply Guidance', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          TextField(
                            controller: messengerCtrl,
                            maxLines: 6,
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                            decoration: InputDecoration(
                              hintText: 'Messenger reply style & guidance...',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text('Comment Reply Guidance', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          TextField(
                            controller: commentCtrl,
                            maxLines: 6,
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                            decoration: InputDecoration(
                              hintText: 'Public post comment reply rules...',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ],
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

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeConv = _conversations.firstWhere(
      (c) => c.id == _selectedConvId,
      orElse: () => ConversationModel(id: '', lastMessageState: 'done'),
    );

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Agent Playground', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(
              _commentMode ? 'Page Comment Mode' : 'Messenger Chat Mode',
              style: TextStyle(fontSize: 11, color: isDark ? Colors.white60 : Colors.black54),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Reload sandbox',
            onPressed: _loadingSandbox ? null : _loadSandbox,
          ),
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Prompt & Guidance',
            onPressed: _agent == null ? null : _showAgentPromptDialog,
          ),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.terminal),
                tooltip: 'Live SSE Trace',
                onPressed: _showLogsSheet,
              ),
              if (_isChatRunning || _isCommentRunning)
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(color: Colors.amber, shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: _loadingSandbox
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Top control banner: Mode selector + conversation button
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.surfaceDark : Colors.grey.shade100,
                    border: Border(bottom: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)),
                  ),
                  child: Row(
                    children: [
                      // Mode Selector Pill
                      Container(
                        decoration: BoxDecoration(
                          color: isDark ? Colors.black26 : Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                        ),
                        child: Row(
                          children: [
                            InkWell(
                              onTap: () => setState(() => _commentMode = false),
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: !_commentMode ? AppTheme.primaryColor : Colors.transparent,
                                  borderRadius: BorderRadius.circular(7),
                                ),
                                child: Text(
                                  'Messenger',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: !_commentMode ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                                  ),
                                ),
                              ),
                            ),
                            InkWell(
                              onTap: () => setState(() => _commentMode = true),
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: _commentMode ? AppTheme.primaryColor : Colors.transparent,
                                  borderRadius: BorderRadius.circular(7),
                                ),
                                child: Text(
                                  'Comments',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _commentMode ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      if (!_commentMode) ...[
                        OutlinedButton.icon(
                          onPressed: _showConversationsSheet,
                          icon: const Icon(Icons.people_outline, size: 14),
                          label: Text(
                            activeConv.id.isNotEmpty ? activeConv.displayName : 'Chats (${_conversations.length})',
                            style: const TextStyle(fontSize: 11),
                          ),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                        const SizedBox(width: 6),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline, color: AppTheme.primaryColor),
                          tooltip: 'New Test Chat',
                          visualDensity: VisualDensity.compact,
                          onPressed: _isChatRunning ? null : _handleCreateChat,
                        ),
                      ],
                      IconButton(
                        icon: const Icon(Icons.analytics_outlined, size: 20),
                        tooltip: 'Token Analysis',
                        visualDensity: VisualDensity.compact,
                        onPressed: _showTokenAnalysisSheet,
                      ),
                    ],
                  ),
                ),

                // Main Content View
                Expanded(
                  child: _commentMode ? _buildCommentView(isDark) : _buildChatView(isDark, activeConv),
                ),
              ],
            ),
    );
  }

  // -------------------------------------------------------------
  // MESSENGER CHAT VIEW
  // -------------------------------------------------------------
  Widget _buildChatView(bool isDark, ConversationModel activeConv) {
    if (_selectedConvId == null && _conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.chat_bubble_outline, size: 48, color: Colors.grey),
              const SizedBox(height: 12),
              const Text('No test conversations yet', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 6),
              const Text(
                'Seed a new chat to test how the AI sales agent answers questions and takes orders.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _isChatRunning ? null : _handleCreateChat,
                icon: const Icon(Icons.add),
                label: const Text('Start New Test Chat'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        // Messages list
        Expanded(
          child: _loadingMessages && _messages.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _chatLoadError != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Failed to load chat: $_chatLoadError', style: const TextStyle(color: AppTheme.danger, fontSize: 12)),
                          TextButton(onPressed: () => _loadMessages(_selectedConvId!), child: const Text('Retry')),
                        ],
                      ),
                    )
                  : ListView.builder(
                      controller: _chatScrollController,
                      padding: const EdgeInsets.all(14),
                      itemCount: _messages.length + (_isChatRunning ? 1 : 0),
                      itemBuilder: (ctx, index) {
                        if (index == _messages.length) {
                          // Typing bubble
                          return Align(
                            alignment: Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: isDark ? AppTheme.cardDark : Colors.grey.shade200,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SizedBox(
                                    width: 12,
                                    height: 12,
                                    child: CircularProgressIndicator(strokeWidth: 1.8),
                                  ),
                                  SizedBox(width: 8),
                                  Text('Agent is thinking…', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                ],
                              ),
                            ),
                          );
                        }

                        final msg = _messages[index];
                        final isCustomer = msg.isFromCustomer;

                        return Align(
                          alignment: isCustomer ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            constraints: BoxConstraints(maxWidth: MediaQuery.of(ctx).size.width * 0.82),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isCustomer
                                  ? AppTheme.primaryColor
                                  : (isDark ? AppTheme.cardDark : Colors.white),
                              borderRadius: BorderRadius.circular(16).copyWith(
                                topRight: isCustomer ? const Radius.circular(2) : const Radius.circular(16),
                                topLeft: !isCustomer ? const Radius.circular(2) : const Radius.circular(16),
                              ),
                              border: !isCustomer
                                  ? Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)
                                  : null,
                              boxShadow: [
                                BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4, offset: const Offset(0, 2)),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (!isCustomer)
                                  const Text(
                                    'AI Sales Rep',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.primaryColor,
                                    ),
                                  ),
                                if (msg.images.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: msg.images.map((url) {
                                      return ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.network(
                                          url,
                                          width: 90,
                                          height: 90,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 40),
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                ],
                                if (msg.content.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    msg.content,
                                    style: TextStyle(
                                      fontSize: 13,
                                      height: 1.35,
                                      color: isCustomer ? Colors.white : (isDark ? Colors.white : Colors.black87),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 4),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    msg.shortTimeLabel,
                                    style: TextStyle(
                                      fontSize: 9,
                                      color: isCustomer ? Colors.white70 : Colors.grey,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
        ),

        // Chat Input Composer
        Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
          decoration: BoxDecoration(
            color: isDark ? AppTheme.surfaceDark : Colors.white,
            border: Border(top: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              children: [
                if (_pendingPhotos.isNotEmpty)
                  Container(
                    height: 70,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _pendingPhotos.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (ctx, idx) {
                        final photo = _pendingPhotos[idx];
                        return Stack(
                          clipBehavior: Clip.none,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(
                                photo['url']!,
                                width: 64,
                                height: 64,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image),
                              ),
                            ),
                            Positioned(
                              top: -4,
                              right: -4,
                              child: GestureDetector(
                                onTap: () => setState(() => _pendingPhotos.removeAt(idx)),
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                Row(
                  children: [
                    IconButton(
                      icon: _uploadingPhoto
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.attach_file, color: AppTheme.primaryColor),
                      tooltip: 'Attach photo',
                      onPressed: (_isChatRunning || _uploadingPhoto) ? null : _attachPhoto,
                    ),
                    Expanded(
                      child: TextField(
                        controller: _messageController,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _handleSendMessage(),
                        decoration: InputDecoration(
                          hintText: 'Ask the sales agent a question...',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          filled: true,
                          fillColor: isDark ? AppTheme.cardDark : Colors.grey.shade100,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton(
                      icon: _isChatRunning
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send_rounded, color: AppTheme.primaryColor),
                      onPressed: (_isChatRunning || _uploadingPhoto) ? null : _handleSendMessage,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // -------------------------------------------------------------
  // PAGE COMMENT TESTING VIEW
  // -------------------------------------------------------------
  Widget _buildCommentView(bool isDark) {
    return Column(
      children: [
        // Comment Thread Display
        Expanded(
          child: _commentThread.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.forum_outlined, size: 48, color: Colors.grey),
                        const SizedBox(height: 12),
                        const Text('Test Public Comment AI Reply', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 6),
                        const Text(
                          'Simulate a customer commenting on a Facebook post.\nWatch whether the AI answers publicly, slips into Messenger DMs, or stays silent.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  controller: _commentScrollController,
                  padding: const EdgeInsets.all(14),
                  itemCount: _commentThread.length + (_isCommentRunning ? 1 : 0),
                  itemBuilder: (ctx, index) {
                    if (index == _commentThread.length) {
                      return Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: isDark ? AppTheme.cardDark : Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.8)),
                              SizedBox(width: 8),
                              Text('Comment agent is deciding where to answer…', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            ],
                          ),
                        ),
                      );
                    }

                    final item = _commentThread[index];
                    final isCustomer = item.from == 'customer';
                    final isDm = item.kind == 'dm';

                    Color bubbleBg;
                    Color badgeColor;
                    String badgeLabel;

                    if (isCustomer) {
                      bubbleBg = isDark ? AppTheme.cardDark : Colors.grey.shade200;
                      badgeColor = Colors.grey;
                      badgeLabel = '${_commenterNameController.text.trim()} · on the post';
                    } else if (isDm) {
                      bubbleBg = const Color(0xFF047857); // Emerald 700
                      badgeColor = const Color(0xFFA7F3D0); // Emerald 200
                      badgeLabel = 'Messenger · only they see it';
                    } else {
                      bubbleBg = AppTheme.primaryColor;
                      badgeColor = const Color(0xFFC7D2FE); // Indigo 200
                      badgeLabel = 'Page · public reply';
                    }

                    return Align(
                      alignment: isCustomer ? Alignment.centerLeft : Alignment.centerRight,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(ctx).size.width * 0.82),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: bubbleBg,
                          borderRadius: BorderRadius.circular(16).copyWith(
                            topLeft: isCustomer ? const Radius.circular(2) : const Radius.circular(16),
                            topRight: !isCustomer ? const Radius.circular(2) : const Radius.circular(16),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              badgeLabel,
                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: badgeColor),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.content,
                              style: TextStyle(
                                fontSize: 13,
                                height: 1.35,
                                color: isCustomer ? (isDark ? Colors.white : Colors.black87) : Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),

        // Comment Input Drawer / Form
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? AppTheme.surfaceDark : Colors.white,
            border: Border(top: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SizedBox(
                      width: 140,
                      child: TextField(
                        controller: _commenterNameController,
                        decoration: InputDecoration(
                          labelText: 'Commenter',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        style: const TextStyle(fontSize: 11),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Start history lines with "page:" for page replies.',
                        style: TextStyle(fontSize: 9, color: Colors.grey),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _historyController,
                  maxLines: 2,
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                  decoration: InputDecoration(
                    hintText: 'Earlier comments (optional):\ndo you ship outside dhaka?\npage: yes, nationwide delivery available',
                    isDense: true,
                    contentPadding: const EdgeInsets.all(8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentTextController,
                        onSubmitted: (_) => _handleRunComment(),
                        decoration: InputDecoration(
                          hintText: 'New public comment (e.g. price bhai?)',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: _isCommentRunning ? null : _handleRunComment,
                      icon: _isCommentRunning
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.play_arrow_rounded, size: 18),
                      label: const Text('Run'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
