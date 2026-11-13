import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/api_config.dart';
import '../../config/app_theme.dart';
import '../../providers/business_provider.dart';
import '../../services/api_service.dart';
import '../../services/diagnostics_service.dart';
import '../../widgets/app_card.dart';

class PostsScreen extends StatefulWidget {
  const PostsScreen({super.key});

  @override
  State<PostsScreen> createState() => _PostsScreenState();
}

class _PostsScreenState extends State<PostsScreen> {
  List<Map<String, dynamic>> _posts = [];
  bool _isLoading = false;
  String? _error;

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
        _posts = res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
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

  Future<void> _delete(String postId) async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;
    try {
      final api = context.read<ApiService>();
      await api.delete(ApiConfig.pathPostDetail(biz.id, postId));
      setState(() => _posts.removeWhere((p) => p['id'] == postId));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  Future<void> _createPost() async {
    final biz = context.read<BusinessProvider>().currentBusiness;
    if (biz == null) return;
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New post'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(hintText: 'What do you want to post?'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok != true) return;
    final text = controller.text.trim();
    if (text.isEmpty) return;
    try {
      final api = context.read<ApiService>();
      await api.post(ApiConfig.pathPosts(biz.id), body: {'content': text});
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Create failed: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>().currentBusiness;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Posts'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(icon: const Icon(Icons.add), onPressed: _createPost),
        ],
      ),
      body: biz == null
          ? const Center(child: Text('Select a store first.'))
          : _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _posts.isEmpty
                      ? const Center(child: Text('No posts yet.'))
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _posts.length,
                          itemBuilder: (ctx, i) {
                            final p = _posts[i];
                            return AppCard(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p['content']?.toString() ?? '', style: const TextStyle(fontSize: 14)),
                                  const SizedBox(height: 8),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      TextButton(
                                        onPressed: () => _delete(p['id']?.toString() ?? ''),
                                        child: const Text('Delete', style: TextStyle(color: AppTheme.danger)),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
    );
  }
}
