import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../models/channel.dart';
import '../../models/post.dart';
import '../../providers/business_provider.dart';
import '../../services/api_service.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';
import 'post_editor_screen.dart';

class PostsScreen extends StatefulWidget {
  const PostsScreen({super.key});

  @override
  State<PostsScreen> createState() => _PostsScreenState();
}

class _PostsScreenState extends State<PostsScreen> {
  List<PostModel> _posts = [];
  bool _isLoading = false;
  String? _error;
  String _filterPlatform = 'all'; // 'all', 'facebook', 'instagram'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final res = await api.get(ApiConfig.pathPosts(biz.id));
      if (res is List) {
        _posts = res
            .map((e) => PostModel.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
      } else {
        _posts = [];
      }
    } catch (e) {
      _error = e.toString();
      appDiagnostics.recordMessage('Posts', 'Load failed: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _deletePost(String postId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;

    final confirmed = await showDialog<bool>(
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

    if (confirmed != true) return;

    try {
      final api = context.read<ApiService>();
      await api.delete(ApiConfig.pathPostDetail(biz.id, postId));
      setState(() => _posts.removeWhere((p) => p.id == postId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Post draft deleted.')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  void _openEditor({String? postId, bool isNew = false}) async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PostEditorScreen(postId: postId, isNew: isNew),
      ),
    );
    if (mounted && (updated == true || isNew)) {
      _load();
    }
  }

  List<PostModel> _filteredPosts(List<ChannelModel> channels) {
    if (_filterPlatform == 'all') return _posts;
    return _posts.where((post) {
      final channel = channels.cast<ChannelModel?>().firstWhere(
            (c) => c?.id == post.channelId,
            orElse: () => null,
          );
      return channel?.platform == _filterPlatform;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>().currentBusiness;
    final channels = context.watch<BusinessProvider>().channels;

    final hasFacebook = channels.any((c) => c.isFacebook);
    final hasInstagram = channels.any((c) => c.isInstagram);
    final filtered = _filteredPosts(channels);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Page Feed'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(isNew: true),
        icon: const Icon(Icons.add),
        label: const Text('New Post'),
      ),
      body: biz == null
          ? const Center(child: Text('Select a store first.'))
          : Column(
              children: [
                // Platform filter chips
                if (hasFacebook || hasInstagram)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: Theme.of(context).cardColor,
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _filterChip(
                            label: 'All',
                            selected: _filterPlatform == 'all',
                            onTap: () => setState(() => _filterPlatform = 'all'),
                          ),
                          if (hasFacebook) ...[
                            const SizedBox(width: 8),
                            _filterChip(
                              label: 'Facebook',
                              icon: Icons.facebook,
                              iconColor: const Color(0xFF1877F2),
                              selected: _filterPlatform == 'facebook',
                              onTap: () => setState(() => _filterPlatform = 'facebook'),
                            ),
                          ],
                          if (hasInstagram) ...[
                            const SizedBox(width: 8),
                            _filterChip(
                              label: 'Instagram',
                              icon: Icons.camera_alt,
                              iconColor: const Color(0xFFE1306C),
                              selected: _filterPlatform == 'instagram',
                              onTap: () => setState(() => _filterPlatform = 'instagram'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                // Feed List
                Expanded(
                  child: _isLoading && _posts.isEmpty
                      ? const Center(child: CircularProgressIndicator())
                      : _error != null
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.error_outline, size: 48, color: AppTheme.danger),
                                    const SizedBox(height: 12),
                                    Text(_error!, textAlign: TextAlign.center),
                                    const SizedBox(height: 16),
                                    ElevatedButton(onPressed: _load, child: const Text('Retry')),
                                  ],
                                ),
                              ),
                            )
                          : filtered.isEmpty
                              ? RefreshIndicator(
                                  onRefresh: _load,
                                  child: ListView(
                                    children: [
                                      SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                                      Center(
                                        child: Column(
                                          children: [
                                            Icon(Icons.feed_outlined, size: 56, color: Colors.grey.withOpacity(0.5)),
                                            const SizedBox(height: 12),
                                            const Text(
                                              'Nothing on the feed yet.',
                                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                            ),
                                            const SizedBox(height: 4),
                                            const Text(
                                              'Tap "+ New Post" to start a draft.',
                                              style: TextStyle(color: Colors.grey, fontSize: 13),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                )
                              : RefreshIndicator(
                                  onRefresh: _load,
                                  child: ListView.separated(
                                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                                    itemCount: filtered.length,
                                    separatorBuilder: (_, __) => const SizedBox(height: 14),
                                    itemBuilder: (ctx, i) {
                                      final post = filtered[i];
                                      final channel = channels.cast<ChannelModel?>().firstWhere(
                                            (c) => c?.id == post.channelId,
                                            orElse: () => null,
                                          );
                                      return _FeedCard(
                                        post: post,
                                        channel: channel,
                                        onTap: () => _openEditor(postId: post.id),
                                        onDelete: () => _deletePost(post.id),
                                      );
                                    },
                                  ),
                                ),
                ),
              ],
            ),
    );
  }

  Widget _filterChip({
    required String label,
    IconData? icon,
    Color? iconColor,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withOpacity(0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primary : Colors.grey.withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: selected ? AppTheme.primary : iconColor),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.bold : FontWeight.w500,
                color: selected ? AppTheme.primary : Colors.grey.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeedCard extends StatefulWidget {
  final PostModel post;
  final ChannelModel? channel;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _FeedCard({
    required this.post,
    required this.channel,
    required this.onTap,
    required this.onDelete,
  });

  @override
  State<_FeedCard> createState() => _FeedCardState();
}

class _FeedCardState extends State<_FeedCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    final channel = widget.channel;
    final photos = post.mediaUrls;
    final hasContent = post.content.trim().isNotEmpty;
    final isLong = post.content.length > 280;

    final likes = post.latestSync?.likeCount ?? post.likeCount;
    final comments = post.latestSync?.commentCount ?? post.commentCount;

    return AppCard(
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Card Header: Avatar, Name, Time, Status Pill
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: channel?.isFacebook == true
                      ? const Color(0xFF1877F2)
                      : const Color(0xFFE1306C),
                  child: Icon(
                    channel?.isFacebook == true ? Icons.facebook : Icons.camera_alt,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        channel?.displayName ?? 'Connected Page',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Row(
                        children: [
                          Text(
                            _formatRelativeTime(post.publishedAt ?? post.createdAt),
                            style: const TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                          if (post.isScheduled && post.scheduledAt != null) ...[
                            const SizedBox(width: 4),
                            const Text('·', style: TextStyle(color: Colors.grey)),
                            const SizedBox(width: 4),
                            const Text('scheduled', style: TextStyle(fontSize: 11, color: Colors.blue)),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                _statusBadge(post.postState),
              ],
            ),
            const SizedBox(height: 12),

            // Post content
            if (hasContent) ...[
              Text(
                post.content,
                maxLines: _expanded ? null : 4,
                overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
              if (isLong)
                InkWell(
                  onTap: () => setState(() => _expanded = !_expanded),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      _expanded ? 'See less' : 'See more',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.primary),
                    ),
                  ),
                ),
            ] else
              const Text(
                'Empty post draft',
                style: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: Colors.grey),
              ),

            // Photo Grid
            if (photos.isNotEmpty) ...[
              const SizedBox(height: 10),
              _buildPhotoGrid(photos),
            ],

            // Likes / Comments metrics strip
            if ((likes != null && likes > 0) || (comments != null && comments > 0)) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  if (likes != null && likes > 0)
                    Text('$likes likes', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  if (likes != null && likes > 0 && comments != null && comments > 0)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6),
                      child: Text('·', style: TextStyle(color: Colors.grey)),
                    ),
                  if (comments != null && comments > 0)
                    Text('$comments comments', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                ],
              ),
            ],

            const SizedBox(height: 8),
            const Divider(),

            // Action row: Like, Comment, Delete
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: widget.onTap,
                      icon: const Icon(Icons.thumb_up_alt_outlined, size: 16, color: Colors.grey),
                      label: Text(
                        likes != null && likes > 0 ? '$likes' : 'Like',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: widget.onTap,
                      icon: const Icon(Icons.chat_bubble_outline, size: 16, color: Colors.grey),
                      label: Text(
                        comments != null && comments > 0 ? '$comments' : 'Comment',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  ],
                ),
                if (!post.isPublished)
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 18, color: Colors.grey),
                    tooltip: 'Delete Draft',
                    onPressed: widget.onDelete,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoGrid(List<String> urls) {
    if (urls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          urls[0],
          width: double.infinity,
          height: 200,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            height: 120,
            color: Colors.grey.withOpacity(0.2),
            child: const Icon(Icons.broken_image, color: Colors.grey),
          ),
        ),
      );
    }

    final shown = urls.take(4).toList();
    final extra = urls.length - shown.length;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: shown.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: shown.length == 3 ? 3 : 2,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemBuilder: (ctx, idx) {
        final isLastWithExtra = idx == 3 && extra > 0;
        return Stack(
          fit: StackFit.expand,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                shown[idx],
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.grey.withOpacity(0.2),
                  child: const Icon(Icons.broken_image, color: Colors.grey),
                ),
              ),
            ),
            if (isLastWithExtra)
              Container(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  '+$extra',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _statusBadge(String state) {
    Color bg;
    Color fg;
    String label = state.toUpperCase();

    switch (state) {
      case 'published':
        bg = const Color(0xFFD1FAE5);
        fg = const Color(0xFF065F46);
        break;
      case 'scheduled':
        bg = const Color(0xFFDBEAFE);
        fg = const Color(0xFF1E40AF);
        break;
      case 'failed':
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFF991B1B);
        break;
      case 'draft':
      default:
        bg = const Color(0xFFFEF3C7);
        fg = const Color(0xFF92400E);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: fg),
      ),
    );
  }

  String _formatRelativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${dt.month}/${dt.day}';
  }
}
