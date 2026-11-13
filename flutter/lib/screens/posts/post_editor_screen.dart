import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../models/post.dart';
import '../../models/product.dart';
import '../../providers/business_provider.dart';
import '../../services/api_service.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';
import '../../widgets/post_image_editor_dialog.dart';

class PostEditorScreen extends StatefulWidget {
  final String? postId;
  final bool isNew;

  const PostEditorScreen({
    super.key,
    this.postId,
    this.isNew = false,
  });

  @override
  State<PostEditorScreen> createState() => _PostEditorScreenState();
}

class _PostEditorScreenState extends State<PostEditorScreen> {
  PostModel? _post;
  bool _isLoading = true;
  String? _errorMessage;

  // Form state
  String? _selectedChannelId;
  final TextEditingController _contentController = TextEditingController();
  List<String> _mediaUrls = [];
  DateTime? _scheduledAt;

  // AI & Product state
  String _sourceMode = 'write'; // 'write' or 'ai'
  List<ProductModel> _products = [];
  bool _loadingProducts = false;
  String? _selectedProductId; // For AI generation
  String? _suggestProductId; // For manual photo shelf
  String _selectedTone = 'friendly';
  final TextEditingController _aiTuneController = TextEditingController();

  // Operation flags
  bool _isSaving = false;
  bool _isPublishing = false;
  bool _isSyncing = false;
  bool _isGenerating = false;
  bool _isTuning = false;
  bool _isUpdatingChannel = false;

  // Comments state (for published posts)
  List<LiveCommentThreadModel> _commentThreads = [];
  bool _loadingComments = false;
  String? _commentsError;
  Timer? _commentsTimer;
  String? _activeReplyToId;
  final Map<String, TextEditingController> _replyControllers = {};
  final TextEditingController _topLevelCommentController = TextEditingController();
  bool _submittingTopLevel = false;
  final Map<String, bool> _submittingReplies = {};

  static const int maxPostMedia = 5;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _init();
    });
  }

  @override
  void dispose() {
    _commentsTimer?.cancel();
    _contentController.dispose();
    _aiTuneController.dispose();
    _topLevelCommentController.dispose();
    for (final c in _replyControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _init() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    _loadProducts();

    if (widget.isNew || widget.postId == null) {
      await _startBlankDraft();
    } else {
      await _loadPostDetail(widget.postId!);
    }
  }

  Future<void> _loadProducts() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;
    setState(() => _loadingProducts = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.get(ApiConfig.pathProducts(biz.id, limit: 100));
      List<ProductModel> prods = [];
      if (res is List) {
        prods = res.map((e) => ProductModel.fromJson(Map<String, dynamic>.from(e))).toList();
      } else if (res is Map && res['products'] is List) {
        prods = (res['products'] as List)
            .map((e) => ProductModel.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
      if (mounted) {
        setState(() {
          _products = prods;
          if (_products.isNotEmpty) {
            _selectedProductId ??= _products.first.id;
          }
          _loadingProducts = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadingProducts = false);
    }
  }

  Future<void> _startBlankDraft() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final channels = context.read<BusinessProvider>().channels;
    if (biz == null) return;

    if (channels.isEmpty) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Please connect a social channel first in Channels.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final api = context.read<ApiService>();
      final firstChannel = channels.first;
      final res = await api.post(
        ApiConfig.pathPosts(biz.id),
        body: {
          'channelId': firstChannel.id,
          'content': '',
        },
      );

      final created = PostModel.fromJson(Map<String, dynamic>.from(res));
      if (!mounted) return;

      setState(() {
        _post = created;
        _selectedChannelId = created.channelId;
        _contentController.text = created.content;
        _mediaUrls = List.from(created.mediaUrls);
        _scheduledAt = created.scheduledAt;
        _suggestProductId = created.productId;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to create post draft: $e';
      });
    }
  }

  Future<void> _loadPostDetail(String postId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final api = context.read<ApiService>();
      final res = await api.get(ApiConfig.pathPostDetail(biz.id, postId));
      final detail = PostModel.fromJson(Map<String, dynamic>.from(res));

      if (!mounted) return;

      setState(() {
        _post = detail;
        _selectedChannelId = detail.channelId;
        _contentController.text = detail.content;
        _mediaUrls = List.from(detail.mediaUrls);
        _scheduledAt = detail.scheduledAt;
        _suggestProductId = detail.productId;
        if (detail.productId != null) {
          _selectedProductId = detail.productId;
        }
        _isLoading = false;
      });

      if (detail.isPublished) {
        _loadComments();
        _startCommentsTimer();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to load post: $e';
      });
    }
  }

  void _startCommentsTimer() {
    _commentsTimer?.cancel();
    _commentsTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted && _post != null && _post!.isPublished) {
        _loadComments(silent: true);
      }
    });
  }

  Future<void> _loadComments({bool silent = false}) async {
    if (!mounted) return;
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null) return;

    if (!silent) {
      setState(() {
        _loadingComments = true;
        _commentsError = null;
      });
    }

    try {
      final api = context.read<ApiService>();
      final res = await api.get(ApiConfig.pathPostComments(biz.id, _post!.id));
      List<LiveCommentThreadModel> list = [];
      if (res is Map && res['threads'] is List) {
        list = (res['threads'] as List)
            .map((e) => LiveCommentThreadModel.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
      if (mounted) {
        setState(() {
          _commentThreads = list;
          _loadingComments = false;
          _commentsError = null;
        });
      }
    } catch (e) {
      if (mounted && !silent) {
        setState(() {
          _loadingComments = false;
          _commentsError = 'Failed to load comments: $e';
        });
      }
    }
  }

  Future<void> _handleUpdateChannel(String newChannelId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null || _isUpdatingChannel) return;

    setState(() => _isUpdatingChannel = true);
    try {
      final api = context.read<ApiService>();
      await api.patch(
        ApiConfig.pathPostDetail(biz.id, _post!.id),
        body: {'channelId': newChannelId},
      );
      if (mounted) {
        setState(() {
          _selectedChannelId = newChannelId;
          _post = _post!.copyWith(channelId: newChannelId);
          _isUpdatingChannel = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Target channel updated.')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUpdatingChannel = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update channel: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handleSavePost({bool showToast = true}) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null || _isSaving) return;

    setState(() => _isSaving = true);
    try {
      final api = context.read<ApiService>();
      final scheduleIso = _scheduledAt?.toIso8601String();
      final newState = scheduleIso != null ? 'scheduled' : 'draft';

      final res = await api.patch(
        ApiConfig.pathPostDetail(biz.id, _post!.id),
        body: {
          'content': _contentController.text,
          'mediaUrls': _mediaUrls,
          'scheduledAt': scheduleIso,
          'postState': newState,
        },
      );

      final updated = PostModel.fromJson(Map<String, dynamic>.from(res));
      if (mounted) {
        setState(() {
          _post = updated;
          _isSaving = false;
        });
        if (showToast) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Post draft saved.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handlePublishNow() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null || _isPublishing) return;

    setState(() => _isPublishing = true);
    try {
      final api = context.read<ApiService>();

      // First save current content
      await api.patch(
        ApiConfig.pathPostDetail(biz.id, _post!.id),
        body: {
          'content': _contentController.text,
          'mediaUrls': _mediaUrls,
        },
      );

      // Trigger publish
      final res = await api.post(ApiConfig.pathPublishPost(biz.id, _post!.id));
      final platformPostId = res is Map ? res['platformPostId']?.toString() : null;

      if (mounted) {
        setState(() {
          _isPublishing = false;
          _post = _post!.copyWith(
            postState: 'published',
            platformPostId: platformPostId,
            publishedAt: DateTime.now(),
          );
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Post published to page feed successfully!'),
            backgroundColor: Color(0xFF10B981),
          ),
        );

        _loadComments();
        _startCommentsTimer();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isPublishing = false;
          _post = _post!.copyWith(postState: 'failed');
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Publish failed: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
    }
  }

  Future<void> _handleSyncStats() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null || _isSyncing) return;

    setState(() => _isSyncing = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post(ApiConfig.pathSyncPost(biz.id, _post!.id));
      if (res is Map && mounted) {
        final sync = PostSyncModel.fromJson(Map<String, dynamic>.from(res));
        setState(() {
          _post = _post!.copyWith(latestSync: sync);
          _isSyncing = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Analytics stats synced from platform.')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSyncing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to sync: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handleAIGenerate() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _selectedProductId == null || _isGenerating) return;

    setState(() => _isGenerating = true);
    try {
      final api = context.read<ApiService>();
      final channelId = _selectedChannelId ?? context.read<BusinessProvider>().channels.first.id;

      final res = await api.post(
        ApiConfig.pathGeneratePost(biz.id),
        body: {
          'channelId': channelId,
          'productId': _selectedProductId,
          'tone': _selectedTone,
        },
      );

      final generated = PostModel.fromJson(Map<String, dynamic>.from(res));
      if (mounted) {
        setState(() {
          _post = generated;
          _contentController.text = generated.content;
          _mediaUrls = List.from(generated.mediaUrls);
          _sourceMode = 'write';
          _suggestProductId = _selectedProductId;
          _isGenerating = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('AI copy generated! Edit or add photos.')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isGenerating = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI Generation failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _handleAITune() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final instruction = _aiTuneController.text.trim();
    if (biz == null || _post == null || instruction.isEmpty || _isTuning) return;

    setState(() => _isTuning = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post(
        ApiConfig.pathTunePost(biz.id, _post!.id),
        body: {'prompt': instruction},
      );

      final tuned = PostModel.fromJson(Map<String, dynamic>.from(res));
      if (mounted) {
        setState(() {
          _post = tuned;
          _contentController.text = tuned.content;
          _aiTuneController.clear();
          _isTuning = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Draft tuned by AI! ✨')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isTuning = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI Tuning failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _pickAndAttachPhoto() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    if (_mediaUrls.length >= maxPostMedia) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 5 images allowed per post.')),
      );
      return;
    }

    final url = await PostImageEditorDialog.pickEditAndUpload(
      context: context,
      businessId: biz.id,
    );

    if (url != null && mounted) {
      setState(() {
        _mediaUrls.add(url);
      });
    }
  }

  Future<void> _submitTopLevelComment() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final text = _topLevelCommentController.text.trim();
    if (biz == null || _post == null || text.isEmpty || _submittingTopLevel) return;

    setState(() => _submittingTopLevel = true);
    try {
      final api = context.read<ApiService>();
      await api.post(
        ApiConfig.pathPostComments(biz.id, _post!.id),
        body: {'content': text},
      );
      _topLevelCommentController.clear();
      await _loadComments(silent: true);
      if (mounted) setState(() => _submittingTopLevel = false);
    } catch (e) {
      if (mounted) {
        setState(() => _submittingTopLevel = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to comment: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _submitReply(String commentId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    final controller = _replyControllers[commentId];
    final text = controller?.text.trim() ?? '';
    if (biz == null || _post == null || text.isEmpty) return;

    setState(() => _submittingReplies[commentId] = true);
    try {
      final api = context.read<ApiService>();
      await api.post(
        ApiConfig.pathReplyComment(biz.id, _post!.id, commentId),
        body: {'content': text},
      );
      controller?.clear();
      setState(() => _activeReplyToId = null);
      await _loadComments(silent: true);
      if (mounted) setState(() => _submittingReplies[commentId] = false);
    } catch (e) {
      if (mounted) {
        setState(() => _submittingReplies[commentId] = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send reply: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  Future<void> _toggleReact(String commentId, bool currentLike) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null || _post == null) return;

    try {
      final api = context.read<ApiService>();
      await api.post(
        ApiConfig.pathReactComment(biz.id, _post!.id, commentId),
        body: {'reaction': currentLike ? null : 'LIKE'},
      );
      await _loadComments(silent: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Reaction failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  int get _charLimit {
    final channels = context.read<BusinessProvider>().channels;
    final active = channels.firstWhere(
      (c) => c.id == _selectedChannelId,
      orElse: () => channels.isNotEmpty ? channels.first : ChannelModel(id: '', businessId: '', platform: 'facebook'),
    );
    return active.isInstagram ? 2200 : 63206;
  }

  bool get _isOverLimit => _contentController.text.length > _charLimit;

  List<String> _extractProductPhotos(ProductModel prod) {
    final photos = <String>{};
    if (prod.imageUrl != null && prod.imageUrl!.isNotEmpty) {
      photos.add(prod.imageUrl!);
    }
    for (final img in prod.images) {
      if (img.isNotEmpty) photos.add(img);
    }
    for (final variant in prod.variants) {
      if (variant.imageUrl != null && variant.imageUrl!.isNotEmpty) {
        photos.add(variant.imageUrl!);
      }
      for (final url in variant.imageUrls) {
        if (url.isNotEmpty) photos.add(url);
      }
    }
    return photos.toList();
  }

  @override
  Widget build(BuildContext context) {
    final channels = context.watch<BusinessProvider>().channels;
    final activeChannel = channels.firstWhere(
      (c) => c.id == _selectedChannelId,
      orElse: () => channels.isNotEmpty
          ? channels.first
          : ChannelModel(id: '', businessId: '', platform: 'facebook'),
    );

    return Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: () => Navigator.pop(context, true)),
        title: Text(_post?.isPublished == true ? 'Published Post' : 'Post Editor'),
        actions: [
          if (_post != null && !_post!.isPublished)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.danger),
              tooltip: 'Delete Draft',
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Delete Post Draft?'),
                    content: const Text('Are you sure you want to delete this draft post?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Delete', style: TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                );
                if (ok == true && mounted) {
                  final biz = context.read<BusinessProvider>().currentBusiness;
                  if (biz != null) {
                    try {
                      await context.read<ApiService>().delete(ApiConfig.pathPostDetail(biz.id, _post!.id));
                      if (context.mounted) Navigator.pop(context, true);
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Delete failed: $e'), backgroundColor: AppTheme.danger),
                        );
                      }
                    }
                  }
                }
              },
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline, size: 48, color: AppTheme.danger),
                        const SizedBox(height: 12),
                        Text(_errorMessage!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Go Back'),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // 1. Channel Selector & Status Stepper Card
                    _buildHeaderCard(activeChannel, channels),
                    const SizedBox(height: 16),

                    // 2. Mode Selector: Write Manually vs Auto-Generate from Product
                    if (_post != null && !_post!.isPublished) ...[
                      _buildSourceSelector(),
                      const SizedBox(height: 16),
                    ],

                    // 3. Post Content Textarea & Char Counter
                    _buildContentEditor(),
                    const SizedBox(height: 16),

                    // 4. Attachments (Thumbnails, Image Editor Picker, Product Photos Shelf)
                    _buildAttachmentsSection(),
                    const SizedBox(height: 16),

                    // 5. AI Tune instruction bar (for non-published posts)
                    if (_post != null && !_post!.isPublished) ...[
                      _buildAiTuneSection(),
                      const SizedBox(height: 16),
                      _buildSchedulingAndActionSection(),
                    ],

                    // 6. Performance Analytics Strip & Comment Section (for published posts)
                    if (_post != null && _post!.isPublished) ...[
                      _buildPerformanceAnalytics(),
                      const SizedBox(height: 20),
                      _buildLiveCommentsSection(activeChannel),
                    ],

                    const SizedBox(height: 40),
                  ],
                ),
    );
  }

  Widget _buildHeaderCard(ChannelModel activeChannel, List<ChannelModel> channels) {
    final state = _post?.postState ?? 'draft';

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TARGET CHANNEL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.8,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (_post?.isPublished == true)
                      Row(
                        children: [
                          Icon(
                            activeChannel.isFacebook ? Icons.facebook : Icons.camera_alt,
                            color: activeChannel.brandColor,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            activeChannel.displayName,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                        ],
                      )
                    else
                      DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedChannelId,
                          isDense: true,
                          icon: _isUpdatingChannel
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.arrow_drop_down),
                          items: channels.map((c) {
                            return DropdownMenuItem<String>(
                              value: c.id,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    c.isFacebook ? Icons.facebook : Icons.camera_alt,
                                    color: c.brandColor,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                ],
                              ),
                            );
                          }).toList(),
                          onChanged: _isUpdatingChannel
                              ? null
                              : (val) {
                                  if (val != null && val != _selectedChannelId) {
                                    _handleUpdateChannel(val);
                                  }
                                },
                        ),
                      ),
                  ],
                ),
              ),
              // Status Stepper Pills
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _statusPill('Draft', state == 'draft', const Color(0xFFD97706)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 4),
                      child: Text('→', style: TextStyle(color: Colors.grey, fontSize: 10)),
                    ),
                    _statusPill('Scheduled', state == 'scheduled', const Color(0xFF2563EB)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 4),
                      child: Text('→', style: TextStyle(color: Colors.grey, fontSize: 10)),
                    ),
                    _statusPill('Published', state == 'published', const Color(0xFF059669)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusPill(String label, bool active, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: active ? color : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: active ? Colors.white : Colors.grey,
        ),
      ),
    );
  }

  Widget _buildSourceSelector() {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _sourceMode = 'write'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: _sourceMode == 'write' ? AppTheme.primary : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    child: Text(
                      '✏️ Write Manually',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: _sourceMode == 'write' ? FontWeight.bold : FontWeight.normal,
                        color: _sourceMode == 'write' ? AppTheme.primary : Colors.grey,
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _sourceMode = 'ai'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: _sourceMode == 'ai' ? AppTheme.primary : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.auto_awesome,
                          size: 14,
                          color: _sourceMode == 'ai' ? AppTheme.primary : Colors.grey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Auto-Generate',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: _sourceMode == 'ai' ? FontWeight.bold : FontWeight.normal,
                            color: _sourceMode == 'ai' ? AppTheme.primary : Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: _sourceMode == 'ai' ? _buildAiConfig() : _buildManualProductShelfPicker(),
          ),
        ],
      ),
    );
  }

  Widget _buildAiConfig() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'SELECT PRODUCT',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
        ),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          value: _selectedProductId,
          isExpanded: true,
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
          items: _products.map((p) {
            return DropdownMenuItem<String>(
              value: p.id,
              child: Text(
                '${p.name} (${p.currency} ${p.price.toStringAsFixed(0)})',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
            );
          }).toList(),
          onChanged: (val) {
            if (val != null) setState(() => _selectedProductId = val);
          },
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'MARKETING TONE',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
                  ),
                  const SizedBox(height: 4),
                  DropdownButtonFormField<String>(
                    value: _selectedTone,
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'friendly', child: Text('😊 Friendly', style: TextStyle(fontSize: 13))),
                      DropdownMenuItem(value: 'professional', child: Text('💼 Professional', style: TextStyle(fontSize: 13))),
                      DropdownMenuItem(value: 'urgent', child: Text('🔥 Urgent (FOMO)', style: TextStyle(fontSize: 13))),
                      DropdownMenuItem(value: 'playful', child: Text('🎉 Playful', style: TextStyle(fontSize: 13))),
                    ],
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedTone = val);
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Padding(
              padding: const EdgeInsets.only(top: 18),
              child: ElevatedButton.icon(
                onPressed: _isGenerating || _products.isEmpty ? null : _handleAIGenerate,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                icon: _isGenerating
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.auto_awesome, size: 16),
                label: const Text('Generate Copy', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildManualProductShelfPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'SELECT PRODUCT TO SUGGEST PHOTOS',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
        ),
        const SizedBox(height: 4),
        DropdownButtonFormField<String?>(
          value: _suggestProductId,
          isExpanded: true,
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
          items: [
            const DropdownMenuItem<String?>(
              value: null,
              child: Text('No product — upload own photos', style: TextStyle(fontSize: 13)),
            ),
            ..._products.map((p) {
              return DropdownMenuItem<String?>(
                value: p.id,
                child: Text(
                  '${p.name} (${p.currency} ${p.price.toStringAsFixed(0)})',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13),
                ),
              );
            }),
          ],
          onChanged: (val) => setState(() => _suggestProductId = val),
        ),
      ],
    );
  }

  Widget _buildContentEditor() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'POST CONTENT',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            Text(
              '${_contentController.text.length} / $_charLimit chars',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: _isOverLimit ? AppTheme.danger : Colors.grey,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _contentController,
          maxLines: 6,
          readOnly: _post?.isPublished == true,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'What would you like to share with your audience? Write here or auto-generate above...',
            hintStyle: const TextStyle(fontSize: 13, color: Colors.grey),
            filled: true,
            fillColor: Theme.of(context).cardColor,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.grey.withOpacity(0.3)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAttachmentsSection() {
    final activeProdId = _sourceMode == 'ai' ? _selectedProductId : _suggestProductId;
    final ProductModel? shelfProd = activeProdId != null
        ? _products.cast<ProductModel?>().firstWhere((p) => p?.id == activeProdId, orElse: () => null)
        : null;

    final shelfPhotos = shelfProd != null ? _extractProductPhotos(shelfProd) : <String>[];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'ATTACHMENTS',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
              ),
              Text(
                '${_mediaUrls.length} / $maxPostMedia photos',
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Attached photos preview row
          if (_mediaUrls.isNotEmpty)
            SizedBox(
              height: 84,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _mediaUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final url = _mediaUrls[i];
                  return Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          url,
                          width: 84,
                          height: 84,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 84,
                            height: 84,
                            color: Colors.grey.withOpacity(0.2),
                            child: const Icon(Icons.broken_image, size: 28, color: Colors.grey),
                          ),
                        ),
                      ),
                      if (_post?.isPublished != true)
                        Positioned(
                          top: 2,
                          right: 2,
                          child: InkWell(
                            onTap: () => setState(() => _mediaUrls.removeAt(i)),
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            )
          else
            const Text(
              'No images attached. Supports up to 5 photos.',
              style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: Colors.grey),
            ),

          const SizedBox(height: 12),

          // Upload photo button with ProImageEditor
          if (_post?.isPublished != true && _mediaUrls.length < maxPostMedia)
            OutlinedButton.icon(
              onPressed: _pickAndAttachPhoto,
              style: OutlinedButton.styleFrom(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              ),
              icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
              label: const Text('Add & Edit Photo (Crop, Filters, Paint)'),
            ),

          // Product photos shelf (tap to toggle)
          if (_post?.isPublished != true && shelfPhotos.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'PHOTOS FROM ${shelfProd?.name.toUpperCase() ?? 'PRODUCT'}',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
                ),
                const Text('Tap to attach', style: TextStyle(fontSize: 10, color: Colors.grey)),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: shelfPhotos.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (ctx, idx) {
                  final pUrl = shelfPhotos[idx];
                  final isAttached = _mediaUrls.contains(pUrl);
                  return InkWell(
                    onTap: () {
                      setState(() {
                        if (isAttached) {
                          _mediaUrls.remove(pUrl);
                        } else if (_mediaUrls.length < maxPostMedia) {
                          _mediaUrls.add(pUrl);
                        }
                      });
                    },
                    child: Stack(
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isAttached ? AppTheme.primary : Colors.grey.withOpacity(0.3),
                              width: isAttached ? 2 : 1,
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(7),
                            child: Image.network(pUrl, fit: BoxFit.cover),
                          ),
                        ),
                        if (isAttached)
                          Positioned(
                            top: 3,
                            right: 3,
                            child: Container(
                              padding: const EdgeInsets.all(2),
                              decoration: const BoxDecoration(
                                color: AppTheme.primary,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.check, size: 12, color: Colors.white),
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAiTuneSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.auto_awesome, size: 14, color: AppTheme.primary),
              SizedBox(width: 6),
              Text(
                'TUNE POST DRAFT WITH AI',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _aiTuneController,
                  decoration: InputDecoration(
                    hintText: 'e.g. "make it more exciting with emoji tags & call to action"',
                    hintStyle: const TextStyle(fontSize: 12, color: Colors.grey),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _isTuning ? null : _handleAITune,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _isTuning
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Tune ✨', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSchedulingAndActionSection() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.access_time, size: 16, color: Colors.grey),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SCHEDULE PUBLICATION',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _scheduledAt != null
                          ? '${_scheduledAt!.year}-${_scheduledAt!.month.toString().padLeft(2, '0')}-${_scheduledAt!.day.toString().padLeft(2, '0')} ${_scheduledAt!.hour.toString().padLeft(2, '0')}:${_scheduledAt!.minute.toString().padLeft(2, '0')}'
                          : 'Immediate / None',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              OutlinedButton(
                onPressed: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _scheduledAt ?? DateTime.now().add(const Duration(hours: 1)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null && mounted) {
                    final time = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay.fromDateTime(_scheduledAt ?? DateTime.now()),
                    );
                    if (time != null && mounted) {
                      setState(() {
                        _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
                      });
                    }
                  }
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Pick Date/Time', style: TextStyle(fontSize: 12)),
              ),
              if (_scheduledAt != null)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: 'Clear schedule',
                  onPressed: () => setState(() => _scheduledAt = null),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _isSaving ? null : () => _handleSavePost(),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: _isSaving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save Draft', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isPublishing || _isOverLimit ? null : _handlePublishNow,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF059669),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: _isPublishing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send, size: 16),
                  label: const Text('Publish Now', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPerformanceAnalytics() {
    final sync = _post?.latestSync;
    final likes = sync?.likeCount ?? _post?.likeCount ?? 0;
    final comments = _commentThreads.isNotEmpty ? _commentThreads.length : (sync?.commentCount ?? _post?.commentCount ?? 0);
    final shares = sync?.shareCount ?? _post?.shareCount ?? 0;
    final reach = sync?.reachCount ?? _post?.reachCount ?? 0;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.bar_chart, size: 16, color: AppTheme.primary),
                  SizedBox(width: 6),
                  Text(
                    'PERFORMANCE ANALYTICS',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                  ),
                ],
              ),
              TextButton.icon(
                onPressed: _isSyncing ? null : _handleSyncStats,
                icon: _isSyncing
                    ? const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.sync, size: 14),
                label: const Text('Sync Stats', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 4,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _metricTile('Likes', likes),
              _metricTile('Comments', comments),
              _metricTile('Shares', shares),
              _metricTile('Reach', reach),
            ],
          ),
        ],
      ),
    );
  }

  Widget _metricTile(String label, int value) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey),
          ),
          const SizedBox(height: 4),
          Text(
            value.toString(),
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.primary),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveCommentsSection(ChannelModel activeChannel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.chat_bubble_outline, size: 16, color: AppTheme.primary),
                const SizedBox(width: 6),
                const Text(
                  'LIVE COMMENTS',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                ),
                if (_commentThreads.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${_commentThreads.length}',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.primary),
                    ),
                  ),
                ],
              ],
            ),
            IconButton(
              icon: _loadingComments
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh, size: 18),
              onPressed: () => _loadComments(),
              tooltip: 'Refresh comments',
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Top level comment box as Page
        AppCard(
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _topLevelCommentController,
                  decoration: InputDecoration(
                    hintText: 'Comment as ${activeChannel.displayName}...',
                    hintStyle: const TextStyle(fontSize: 12, color: Colors.grey),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _submittingTopLevel ? null : _submitTopLevelComment,
                icon: _submittingTopLevel
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send, color: AppTheme.primary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Comments list
        if (_commentThreads.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.withOpacity(0.2)),
            ),
            child: const Text(
              'No comments on this post yet.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _commentThreads.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (ctx, i) {
              final thread = _commentThreads[i];
              return _buildCommentThreadCard(thread, activeChannel);
            },
          ),
      ],
    );
  }

  Widget _buildCommentThreadCard(LiveCommentThreadModel thread, ChannelModel activeChannel) {
    final comment = thread.comment;
    final isReplyOpen = _activeReplyToId == thread.id;

    _replyControllers.putIfAbsent(thread.id, () => TextEditingController());
    final replyController = _replyControllers[thread.id]!;
    final isSubmittingReply = _submittingReplies[thread.id] == true;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: Colors.blue.withOpacity(0.15),
                child: Text(
                  (thread.commenterName?.isNotEmpty == true ? thread.commenterName![0] : 'U').toUpperCase(),
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.blue),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          thread.commenterName ?? 'Customer',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          _timeAgo(comment.time),
                          style: const TextStyle(fontSize: 10, color: Colors.grey),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(comment.content, style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        InkWell(
                          onTap: () => _toggleReact(thread.id, comment.userLikes),
                          child: Row(
                            children: [
                              Icon(
                                comment.userLikes ? Icons.thumb_up : Icons.thumb_up_alt_outlined,
                                size: 14,
                                color: comment.userLikes ? AppTheme.primary : Colors.grey,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                comment.likeCount > 0 ? '${comment.likeCount}' : 'Like',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: comment.userLikes ? AppTheme.primary : Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        InkWell(
                          onTap: () {
                            setState(() {
                              _activeReplyToId = isReplyOpen ? null : thread.id;
                            });
                          },
                          child: const Row(
                            children: [
                              Icon(Icons.reply, size: 14, color: Colors.grey),
                              SizedBox(width: 4),
                              Text('Reply', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Replies list
          if (thread.replies.isNotEmpty) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: Column(
                children: thread.replies.map((reply) {
                  final isSelf = reply.from == 'self';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isSelf ? Colors.blue.withOpacity(0.05) : Colors.grey.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Text(
                                  isSelf ? activeChannel.displayName : (reply.commenterName ?? 'Customer'),
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                    color: isSelf ? AppTheme.primary : null,
                                  ),
                                ),
                                if (isSelf) ...[
                                  const SizedBox(width: 4),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: AppTheme.primary,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      'PAGE',
                                      style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Colors.white),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            Text(_timeAgo(reply.time), style: const TextStyle(fontSize: 9, color: Colors.grey)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(reply.content, style: const TextStyle(fontSize: 12)),
                        const SizedBox(height: 4),
                        InkWell(
                          onTap: () => _toggleReact(reply.id, reply.userLikes),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                reply.userLikes ? Icons.thumb_up : Icons.thumb_up_alt_outlined,
                                size: 12,
                                color: reply.userLikes ? AppTheme.primary : Colors.grey,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                reply.likeCount > 0 ? '${reply.likeCount}' : 'Like',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: reply.userLikes ? AppTheme.primary : Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ],

          // Inline reply input
          if (isReplyOpen) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: replyController,
                      autofocus: true,
                      decoration: InputDecoration(
                        hintText: 'Reply as ${activeChannel.displayName}...',
                        hintStyle: const TextStyle(fontSize: 11, color: Colors.grey),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton(
                    icon: isSubmittingReply
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send, size: 18, color: AppTheme.primary),
                    onPressed: isSubmittingReply ? null : () => _submitReply(thread.id),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${dt.month}/${dt.day}';
  }
}
