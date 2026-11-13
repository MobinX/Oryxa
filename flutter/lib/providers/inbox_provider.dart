import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/conversation.dart';
import '../services/api_service.dart';

class InboxProvider extends ChangeNotifier {
  final ApiService apiService;

  List<ConversationModel> _conversations = [];
  String? _selectedChannelId;
  String _selectedStateFilter = 'all'; // 'all', 'open', 'done'
  String _searchQuery = '';

  // Active thread
  ConversationModel? _activeConversation;
  List<MessageModel> _activeMessages = [];
  bool _isLoadingMessages = false;
  bool _isSending = false;
  bool _isGeneratingSuggestions = false;
  List<InboxSuggestion> _suggestions = [];
  String? _suggestionError;

  bool _isLoading = false;
  String? _errorMessage;

  InboxProvider({required this.apiService});

  List<ConversationModel> get conversations {
    return _conversations.where((c) {
      if (_selectedChannelId != null && _selectedChannelId!.isNotEmpty) {
        if (c.channelId != _selectedChannelId) return false;
      }
      if (_selectedStateFilter == 'done' && c.lastMessageState != 'done') {
        return false;
      }
      if (_selectedStateFilter == 'open' &&
          c.lastMessageState != 'pending' &&
          c.lastMessageState != 'working') {
        return false;
      }
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final haystack =
            '${c.customerName ?? ''} ${c.pageName ?? ''} ${c.customerPlatformId ?? ''}'
                .toLowerCase();
        if (!haystack.contains(q)) return false;
      }
      return true;
    }).toList();
  }

  List<ConversationModel> get allConversations => _conversations;
  ConversationModel? get activeConversation => _activeConversation;
  List<MessageModel> get activeMessages => _activeMessages;
  bool get isLoading => _isLoading;
  bool get isLoadingMessages => _isLoadingMessages;
  bool get isSending => _isSending;
  bool get isGeneratingSuggestions => _isGeneratingSuggestions;
  List<InboxSuggestion> get suggestions => _suggestions;
  String? get suggestionError => _suggestionError;
  String? get errorMessage => _errorMessage;
  String? get selectedChannelId => _selectedChannelId;
  String get selectedStateFilter => _selectedStateFilter;
  String get searchQuery => _searchQuery;

  int get totalConversations => _conversations.length;
  int get openCount => _conversations
      .where((c) => c.lastMessageState == 'pending' || c.lastMessageState == 'working')
      .length;
  int get resolvedCount =>
      _conversations.where((c) => c.lastMessageState == 'done').length;

  void clearError() {
    if (_errorMessage == null) return;
    _errorMessage = null;
    notifyListeners();
  }

  void setChannelFilter(String? channelId) {
    _selectedChannelId = channelId;
    notifyListeners();
  }

  void setStateFilter(String state) {
    _selectedStateFilter = state;
    notifyListeners();
  }

  void setSearchQuery(String q) {
    _searchQuery = q.trim();
    notifyListeners();
  }

  Future<void> fetchConversations(String businessId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.get(
        ApiConfig.pathConversations(
          businessId,
          channelId: _selectedChannelId,
          limit: 100,
        ),
      );
      if (res is List) {
        _conversations = res
            .whereType<Map>()
            .map((c) => ConversationModel.fromJson(Map<String, dynamic>.from(c)))
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
    _suggestionError = null;
    notifyListeners();
  }

  void clearActiveConversation() {
    _activeConversation = null;
    _activeMessages = [];
    _suggestions = [];
    _suggestionError = null;
    notifyListeners();
  }

  Future<void> fetchMessages(
    String businessId,
    String conversationId, {
    bool silent = false,
  }) async {
    if (!silent) {
      _isLoadingMessages = true;
      notifyListeners();
    }

    try {
      final res = await apiService.get(
        ApiConfig.pathMessages(businessId, conversationId),
      );
      if (res is List) {
        _activeMessages = res
            .whereType<Map>()
            .map((m) => MessageModel.fromJson(
                  Map<String, dynamic>.from(m),
                  conversationId: conversationId,
                ))
            .toList();
        // Keep the active conversation's last state in step with the thread.
        final active = _activeConversation;
        if (active != null && active.id == conversationId) {
          final refreshed = _conversations.where((c) => c.id == conversationId);
          if (refreshed.isNotEmpty) {
            _activeConversation = active.copyWith(
              lastMessageState: refreshed.first.lastMessageState,
              autoPilot: refreshed.first.autoPilot,
            );
          }
        }
      }
      _isLoadingMessages = false;
      notifyListeners();
    } catch (e) {
      _isLoadingMessages = false;
      if (!silent) {
        _errorMessage = apiErrorMessage(e);
      }
      debugPrint('[InboxProvider] fetchMessages error: $e');
      notifyListeners();
    }
  }

  /// Send manual message reply from merchant.
  Future<bool> sendMessage(String businessId, String conversationId, String content) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) return false;
    _isSending = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await apiService.post(
        ApiConfig.pathSendMessage(businessId, conversationId),
        body: {'content': trimmed, 'contentType': 'text'},
      );

      final newMsg = MessageModel(
        id: (res is Map && res['id'] != null)
            ? res['id'].toString()
            : 'temp_${DateTime.now().millisecondsSinceEpoch}',
        conversationId: conversationId,
        from: 'self',
        sentBy: 'human',
        content: trimmed,
        contentType: 'text',
        state: 'done',
        time: DateTime.now(),
      );

      _activeMessages.add(newMsg);
      _isSending = false;
      _suggestions = [];
      _suggestionError = null;
      notifyListeners();
      // Replace the optimistic row with the server's copy (ids, time, images).
      await fetchMessages(businessId, conversationId, silent: true);
      return true;
    } catch (e) {
      _isSending = false;
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  /// Toggle Autopilot (AI Agent vs Human Manual takeover). The business-wide kill
  /// switch outranks the thread setting, so callers pass whether the agent is on.
  Future<bool> toggleAutopilot(
    String businessId,
    String conversationId, {
    bool businessAgentOn = true,
  }) async {
    final active = _activeConversation;
    if (active == null || !businessAgentOn) return false;
    return setAutopilot(businessId, conversationId, !active.autoPilot);
  }

  Future<bool> setAutopilot(
    String businessId,
    String conversationId,
    bool autoPilot,
  ) async {
    try {
      final res = await apiService.patch(
        ApiConfig.pathAutopilot(businessId, conversationId),
        body: {'autoPilot': autoPilot},
      );

      final saved = (res is Map && res['autoPilot'] is bool)
          ? res['autoPilot'] as bool
          : autoPilot;

      final active = _activeConversation;
      if (active != null && active.id == conversationId) {
        _activeConversation = active.copyWith(autoPilot: saved);
      }
      final idx = _conversations.indexWhere((c) => c.id == conversationId);
      if (idx != -1) {
        _conversations[idx] = _conversations[idx].copyWith(autoPilot: saved);
      }
      _errorMessage = null;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateConversationState(
    String businessId,
    String conversationId,
    String state,
  ) async {
    try {
      await apiService.patch(
        ApiConfig.pathConversationState(businessId, conversationId),
        body: {'state': state},
      );

      final idx = _conversations.indexWhere((c) => c.id == conversationId);
      if (idx != -1) {
        _conversations[idx] =
            _conversations[idx].copyWith(lastMessageState: state);
      }
      final active = _activeConversation;
      if (active != null && active.id == conversationId) {
        _activeConversation = active.copyWith(lastMessageState: state);
      }
      _errorMessage = null;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteConversation(String businessId, String conversationId) async {
    try {
      await apiService.delete(
        ApiConfig.pathConversation(businessId, conversationId),
      );
      _conversations.removeWhere((c) => c.id == conversationId);
      if (_activeConversation?.id == conversationId) {
        clearActiveConversation();
      }
      _errorMessage = null;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  /// Bulk delete is best-effort, exactly like the web action: one missing thread must
  /// not leave the other selected threads undeleted.
  Future<int> deleteConversations(String businessId, List<String> ids) async {
    var deleted = 0;
    for (final id in ids) {
      try {
        await apiService.delete(ApiConfig.pathConversation(businessId, id));
        _conversations.removeWhere((c) => c.id == id);
        if (_activeConversation?.id == id) {
          _activeConversation = null;
          _activeMessages = [];
        }
        deleted++;
      } catch (e) {
        debugPrint('[InboxProvider] bulk delete $id failed: $e');
      }
    }
    notifyListeners();
    return deleted;
  }

  /// Generate contextual suggestions using the store's answering agent.
  Future<bool> generateSuggestions(String businessId, String conversationId) async {
    _isGeneratingSuggestions = true;
    _suggestionError = null;
    _suggestions = [];
    notifyListeners();

    try {
      final res = await apiService.post(
        ApiConfig.pathSuggestions(businessId, conversationId),
      );
      if (res is Map && res['suggestions'] is List) {
        _suggestions = (res['suggestions'] as List)
            .whereType<Map>()
            .map((s) => InboxSuggestion.fromJson(Map<String, dynamic>.from(s)))
            .toList();
      }
      _isGeneratingSuggestions = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isGeneratingSuggestions = false;
      _suggestionError = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<bool> sendSuggestion(
    String businessId,
    String conversationId,
    Map<String, dynamic> payload,
  ) async {
    try {
      await apiService.post(
        ApiConfig.pathSendSuggestion(businessId, conversationId),
        body: payload,
      );
      await fetchMessages(businessId, conversationId, silent: true);
      return true;
    } catch (e) {
      _suggestionError = apiErrorMessage(e);
      notifyListeners();
      return false;
    }
  }

  Future<ConversationOrderDefaults?> fetchOrderDefaults(
    String businessId,
    String conversationId,
  ) async {
    try {
      final res = await apiService.get(
        ApiConfig.pathOrderDefaults(businessId, conversationId),
      );
      if (res is Map<String, dynamic>) {
        return ConversationOrderDefaults.fromJson(res);
      }
    } catch (e) {
      debugPrint('[InboxProvider] order defaults error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> createConversationOrder(
    String businessId,
    String conversationId,
    Map<String, dynamic> payload,
  ) async {
    try {
      final res = await apiService.post(
        ApiConfig.pathCreateConversationOrder(businessId, conversationId),
        body: payload,
      );
      if (res is Map<String, dynamic>) {
        await fetchMessages(businessId, conversationId, silent: true);
        return res;
      }
    } catch (e) {
      _errorMessage = apiErrorMessage(e);
      notifyListeners();
    }
    return null;
  }

  void clearSuggestions() {
    _suggestions = [];
    _suggestionError = null;
    notifyListeners();
  }
}
