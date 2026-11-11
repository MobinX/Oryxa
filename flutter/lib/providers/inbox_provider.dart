import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/conversation.dart';
import '../services/api_service.dart';

class InboxProvider extends ChangeNotifier {
  final ApiService apiService;

  List<ConversationModel> _conversations = [];
  String? _selectedChannelId;
  String _selectedStateFilter = 'all'; // 'all', 'pending', 'done'
  String _searchQuery = '';

  // Active thread
  ConversationModel? _activeConversation;
  List<MessageModel> _activeMessages = [];
  bool _isLoadingMessages = false;
  bool _isSending = false;
  bool _isGeneratingSuggestions = false;
  List<InboxSuggestion> _suggestions = [];

  bool _isLoading = false;
  String? _errorMessage;

  InboxProvider({required this.apiService});

  List<ConversationModel> get conversations {
    return _conversations.where((c) {
      if (_selectedChannelId != null && _selectedChannelId!.isNotEmpty) {
        if (c.channelId != _selectedChannelId) return false;
      }
      if (_selectedStateFilter != 'all') {
        if (_selectedStateFilter == 'done' && c.lastMessageState != 'done') return false;
        if (_selectedStateFilter == 'pending' && c.lastMessageState == 'done') return false;
      }
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final name = (c.customerName ?? '').toLowerCase();
        final page = (c.pageName ?? '').toLowerCase();
        if (!name.contains(q) && !page.contains(q)) return false;
      }
      return true;
    }).toList();
  }

  ConversationModel? get activeConversation => _activeConversation;
  List<MessageModel> get activeMessages => _activeMessages;
  bool get isLoading => _isLoading;
  bool get isLoadingMessages => _isLoadingMessages;
  bool get isSending => _isSending;
  bool get isGeneratingSuggestions => _isGeneratingSuggestions;
  List<InboxSuggestion> get suggestions => _suggestions;
  String? get errorMessage => _errorMessage;
  String? get selectedChannelId => _selectedChannelId;
  String get selectedStateFilter => _selectedStateFilter;

  void setChannelFilter(String? channelId) {
    _selectedChannelId = channelId;
    notifyListeners();
  }

  void setStateFilter(String state) {
    _selectedStateFilter = state;
    notifyListeners();
  }

  void setSearchQuery(String q) {
    _searchQuery = q;
    notifyListeners();
  }

  Future<void> fetchConversations(String businessId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathConversations(businessId, limit: 100));
      if (res is List) {
        _conversations = res
            .map((c) => ConversationModel.fromJson(c as Map<String, dynamic>))
            .toList();
      }
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
    }
  }

  void selectConversation(ConversationModel conv) {
    _activeConversation = conv;
    _activeMessages = [];
    _suggestions = [];
    notifyListeners();
  }

  Future<void> fetchMessages(String businessId, String conversationId) async {
    _isLoadingMessages = true;
    notifyListeners();

    try {
      final res = await apiService.get(ApiConfig.pathMessages(businessId, conversationId));
      if (res is List) {
        _activeMessages = res
            .map((m) => MessageModel.fromJson(m as Map<String, dynamic>))
            .toList();
      }
      _isLoadingMessages = false;
      notifyListeners();
    } catch (e) {
      _isLoadingMessages = false;
      debugPrint('[InboxProvider] fetchMessages error: $e');
      notifyListeners();
    }
  }

  /// Send manual message reply from merchant
  Future<bool> sendMessage(String businessId, String conversationId, String content) async {
    if (content.trim().isEmpty) return false;
    _isSending = true;
    notifyListeners();

    try {
      final res = await apiService.post(
        ApiConfig.pathSendMessage(businessId, conversationId),
        body: {'content': content.trim(), 'contentType': 'text'},
      );

      final newMsg = MessageModel(
        id: (res is Map && res['id'] != null) ? res['id'].toString() : 'temp_${DateTime.now().millisecondsSinceEpoch}',
        conversationId: conversationId,
        from: 'self',
        content: content.trim(),
        contentType: 'text',
        state: 'done',
        time: DateTime.now(),
      );

      _activeMessages.add(newMsg);
      _isSending = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isSending = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  /// Toggle Autopilot (AI Agent vs Human Manual takeover)
  Future<bool> toggleAutopilot(String businessId, String conversationId) async {
    if (_activeConversation == null) return false;
    final newState = !_activeConversation!.autoPilot;

    try {
      await apiService.patch(
        ApiConfig.pathAutopilot(businessId, conversationId),
        body: {'autoPilot': newState},
      );

      _activeConversation = _activeConversation!.copyWith(autoPilot: newState);
      final idx = _conversations.indexWhere((c) => c.id == conversationId);
      if (idx != -1) {
        _conversations[idx] = _conversations[idx].copyWith(autoPilot: newState);
      }
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  /// Generate contextual suggestions using LLM
  Future<void> generateSuggestions(String businessId, String conversationId) async {
    _isGeneratingSuggestions = true;
    _suggestions = [];
    notifyListeners();

    try {
      final res = await apiService.post(
        ApiConfig.pathSuggestions(businessId, conversationId),
      );
      if (res is Map && res['suggestions'] is List) {
        _suggestions = (res['suggestions'] as List)
            .map((s) => InboxSuggestion.fromJson(s as Map<String, dynamic>))
            .toList();
      }
    } catch (e) {
      debugPrint('[InboxProvider] generateSuggestions error: $e');
    } finally {
      _isGeneratingSuggestions = false;
      notifyListeners();
    }
  }

  void clearSuggestions() {
    _suggestions = [];
    notifyListeners();
  }
}
