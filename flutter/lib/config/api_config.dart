class ApiConfig {
  /// Default backend URL.
  /// Local dev: http://10.0.2.2:3001 (Android Emulator) or http://localhost:3001
  /// Production: the web dashboard proxies `/api/v1` to the API on the same origin.
  ///
  /// `web.oryxa.us` is no longer ours — it is a parked domain, so every request used to
  /// land on an unrelated HTML page and quietly parse as "no data". Keep this pointing at
  /// the domain the web dashboard actually runs on.
  static const String defaultBaseUrl = 'https://onlyorders.tech/api/v1';
  static const String defaultWebOrigin = 'https://onlyorders.tech';
  static const String devLocalBaseUrl = 'http://10.0.2.2:3001/api/v1';

  /// Public Firebase web config for the mobile sign-in. It lives beside the web app, on
  /// its origin, and exposes only the browser Firebase config (the same values every
  /// visitor of the web dashboard already receives).
  static const String pathMobileFirebaseConfig = '/api/mobile/config';
  static const String pathMobileGoogleLogin = '/login/mobile-google-login';

  /// Custom scheme the web page uses to hand a Google session back to the app.
  static const String authCallbackScheme = 'onlyorders';
  static const String authCallbackHost = 'auth';
  static const String authCallbackUrl = '$authCallbackScheme://$authCallbackHost';

  static String mobileGoogleLoginUrl([String? baseUrl]) =>
      '${webOrigin(baseUrl)}$pathMobileGoogleLogin?redirect=${Uri.encodeComponent(authCallbackUrl)}';

  // Storage key for custom base URL
  static const String storageKeyBaseUrl = 'api_base_url';
  static const String storageKeyToken = 'auth_token';
  static const String storageKeyRefreshToken = 'auth_refresh_token';
  static const String storageKeyTokenExpiry = 'auth_token_expiry';
  static const String storageKeyFirebaseApiKey = 'firebase_web_api_key';
  static const String storageKeySelectedBusiness = 'selected_business_id';
  static const String storageKeyUser = 'user_data';
  static const String storageKeyUserSessionType = 'user_session_type'; // 'merchant' | 'admin'
  static const String storageKeyAdminToken = 'admin_token';
  static const String storageKeyAdminUser = 'admin_user';
  static const String storageKeyAdminFirebaseToken = 'admin_firebase_token';

  /// Origin of the web dashboard for a given API base URL. `…/api/v1` becomes the host
  /// the dashboard is served from; anything unparseable falls back to production.
  static String webOrigin([String? baseUrl]) {
    final uri = Uri.tryParse((baseUrl ?? defaultBaseUrl).trim());
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return defaultWebOrigin;
    }
    final port = uri.hasPort ? ':${uri.port}' : '';
    return '${uri.scheme}://${uri.host}$port';
  }

  static String mobileFirebaseConfigUrl([String? baseUrl]) =>
      '${webOrigin(baseUrl)}$pathMobileFirebaseConfig';

  /// Hosts a previous build pointed at that are no longer ours. Requests there return a
  /// parking page, so a saved value has to be discarded rather than reused.
  static bool isRetiredHost(String url) {
    final host = Uri.tryParse(url.trim())?.host.toLowerCase();
    return host == 'web.oryxa.us' || host == 'api.oryxa.us';
  }

  // API endpoints
  static const String pathUsersMe = '/users/me';
  static const String pathUsersSync = '/users/sync';
  static const String pathBusinesses = '/businesses';
  static const String pathPlans = '/plans';

  static String pathBusiness(String businessId) => '/businesses/$businessId';
  static String pathBusinessStats(String businessId) => '/businesses/$businessId/stats';
  static String pathBusinessAnalytics(String businessId, {int days = 30}) =>
      '/businesses/$businessId/analytics?days=$days';
  static String pathTokenAnalytics(String businessId, {int hours = 24}) =>
      '/$businessId/analytics/tokens?hours=$hours';
  static String pathBusinessSearch(String businessId, String query) =>
      '/businesses/$businessId/search?q=${Uri.encodeComponent(query)}';

  static String pathBusinessPushSubscribe(String businessId) => '/$businessId/push/subscribe';
  static String pathBusinessPushUnsubscribe(String businessId) => '/$businessId/push/unsubscribe';
  static const String pathGlobalPushUnsubscribe = '/push/unsubscribe';

  static String pathConversations(String businessId, {String? channelId, int limit = 50}) {
    var p = '/$businessId/conversations?limit=$limit';
    if (channelId != null && channelId.isNotEmpty) {
      p += '&channelId=${Uri.encodeComponent(channelId)}';
    }
    return p;
  }

  static String pathConversation(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId';
  static String pathConversationState(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/state';
  static String pathMessages(String businessId, String conversationId, {int limit = 100}) =>
      '/$businessId/conversations/$conversationId/messages?limit=$limit';
  static String pathSendMessage(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/messages';
  static String pathAutopilot(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/auto-pilot';
  static String pathSuggestions(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/suggestions';
  static String pathSendSuggestion(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/suggestions/send';
  static String pathOrderDefaults(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/order-defaults';
  static String pathCreateConversationOrder(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/orders';

  static String pathOrders(String businessId, {String? state, int limit = 50}) {
    var p = '/$businessId/orders?limit=$limit';
    if (state != null && state.isNotEmpty && state != 'all') {
      p += '&state=${Uri.encodeComponent(state)}';
    }
    return p;
  }

  static String pathOrderDetail(String businessId, String orderId) =>
      '/$businessId/orders/$orderId';
  static String pathOrderState(String businessId, String orderId) =>
      '/$businessId/orders/$orderId/state';

  static String pathProducts(String businessId, {String? categoryId, String? search, int limit = 50}) {
    var p = '/$businessId/products?limit=$limit';
    if (categoryId != null && categoryId.isNotEmpty) {
      p += '&categoryId=${Uri.encodeComponent(categoryId)}';
    }
    if (search != null && search.isNotEmpty) {
      // The catalog route names this `q`; `search` is the customers route's spelling.
      p += '&q=${Uri.encodeComponent(search)}';
    }
    return p;
  }

  static String pathProductDetail(String businessId, String productId) =>
      '/$businessId/products/$productId';
  static String pathCategories(String businessId) =>
      '/$businessId/categories';
  static String pathCategoryDetail(String businessId, String categoryId) =>
      '/$businessId/categories/$categoryId';

  static String pathCustomers(String businessId, {String? search, int limit = 50}) {
    var p = '/$businessId/customers?limit=$limit';
    if (search != null && search.isNotEmpty) {
      p += '&search=${Uri.encodeComponent(search)}';
    }
    return p;
  }

  static String pathCustomerDetail(String businessId, String customerId) =>
      '/$businessId/customers/$customerId';

  static String pathChannels(String businessId) =>
      '/$businessId/channels';
  static String pathChannelDetail(String businessId, String channelId) =>
      '/$businessId/channels/$channelId';

  static String pathBilling(String businessId) =>
      '/$businessId/billing';
  static String pathNotifications(String businessId, {bool? unread}) =>
      unread == true ? '/$businessId/notifications?unread=true' : '/$businessId/notifications';
  static String pathNotificationsRead(String businessId) =>
      '/$businessId/notifications/read';
  static String pathPushTest(String businessId) =>
      '/$businessId/push/test';
  static String pathMessengerNotifications(String businessId) =>
      '/$businessId/messenger-notifications';
  static String pathMessengerNotificationUser(String businessId, String userId) =>
      '/$businessId/messenger-notifications/users/$userId';

  static String pathPosts(String businessId) =>
      '/$businessId/posts';

  static String pathPlaygroundChat(String businessId) =>
      '/$businessId/playground/chat';

  static String pathPlaygroundTestRun(String businessId) =>
      '/$businessId/playground/test-run';

  static String pathPlaygroundCommentTestRun(String businessId) =>
      '/$businessId/playground/comment-test-run';

  static String pathDefaultAgent(String businessId) =>
      '/$businessId/agents/default';

  static String pathAgentDetail(String businessId, String agentId) =>
      '/$businessId/agents/$agentId';

  static String pathPostDetail(String businessId, String postId) =>
      '/$businessId/posts/$postId';

  static String pathPublishPost(String businessId, String postId) =>
      '/$businessId/posts/$postId/publish';

  static String pathSyncPost(String businessId, String postId) =>
      '/$businessId/posts/$postId/sync';

  static String pathGeneratePost(String businessId) =>
      '/$businessId/posts/generate';

  static String pathTunePost(String businessId, String postId) =>
      '/$businessId/posts/$postId/tune';

  static String pathPostComments(String businessId, String postId) =>
      '/$businessId/posts/$postId/comments';

  static String pathReplyComment(
          String businessId, String postId, String commentId) =>
      '/$businessId/posts/$postId/comments/$commentId/reply';

  static String pathReactComment(
          String businessId, String postId, String commentId) =>
      '/$businessId/posts/$postId/comments/$commentId/react';
  static String pathAds(String businessId, {int days = 30}) =>
      '/$businessId/ads?days=$days';

  // Admin Console Endpoints
  static const String pathAdminLogin = '/api/admin/login';
  static const String pathApi2AdminLogin = '/api2/admin/login';
  static const String pathAdminMe = '/api2/admin/me';
  static const String pathAdminLogout = '/api2/admin/logout';
  static String pathAdminStats({int days = 30, String tz = 'UTC'}) =>
      '/api2/admin/stats?days=$days&tz=${Uri.encodeComponent(tz)}';
  static const String pathAdminMailbox = '/api2/admin/mail/mailbox';
  static const String pathAdminMailStorage = '/api2/admin/mail/storage';
  static String pathAdminEmails({String folder = 'inbox', String? q, int limit = 40, int offset = 0}) {
    var p = '/api2/admin/mail/emails?limit=$limit&offset=$offset';
    if (folder == 'sent') {
      p += '&direction=outbound&trashed=false';
    } else if (folder == 'trash') {
      p += '&trashed=true';
    } else if (folder == 'all') {
      p += '&trashed=false';
    } else {
      p += '&direction=inbound&trashed=false';
    }
    if (q != null && q.isNotEmpty) {
      p += '&q=${Uri.encodeComponent(q)}';
    }
    return p;
  }
  static String pathAdminEmailDetail(String id) => '/api2/admin/mail/emails/$id';
  static const String pathAdminMailSend = '/api2/admin/mail/send';
  static String pathAdminMailReply(String id) => '/api2/admin/mail/emails/$id/reply';
  static String pathAdminMailForward(String id) => '/api2/admin/mail/emails/$id/forward';
  static String pathAdminMailTrash(String id) => '/api2/admin/mail/emails/$id/trash';
  static String pathAdminMailRestore(String id) => '/api2/admin/mail/emails/$id/restore';
  static String pathAdminMailDelete(String id) => '/api2/admin/mail/emails/$id/delete';
  static const String pathAdminMailPushSubscribe = '/api2/admin/mail/push/subscribe';
  static const String pathAdminMailPushUnsubscribe = '/api2/admin/mail/push/unsubscribe';
  static const String pathAdminMailPushHeartbeat = '/api2/admin/mail/push/heartbeat';
  static const String pathAdminMailPushStatus = '/api2/admin/mail/push/status';
  static const String pathAdminMailPushTest = '/api2/admin/mail/push/test';
  static const String pathAdminTokenAnalytics = '/api2/admin/token-analytics';
  static String pathAdminTokenUsage({String? month}) =>
      '/api2/admin/token-analytics/businesses${month != null ? '?month=$month' : ''}';
  static String pathAdminBusinessTokenUsage(String businessId, {String? month}) =>
      '/api2/admin/token-analytics/businesses/$businessId${month != null ? '?month=$month' : ''}';
  static const String pathAdminModelBilling = '/api2/admin/model-billing';
  static const String pathAdminPlans = '/api2/admin/plans';
  static const String pathAdminBusinessPlans = '/api2/admin/plans/businesses';
  static String pathAdminPlan(String id) => '/api2/admin/plans/$id';
  static String pathAdminBusinessPlan(String businessId) =>
      '/api2/admin/businesses/$businessId/plan';
  static String pathAdminBusinessCaps(String businessId) =>
      '/api2/admin/businesses/$businessId/caps';
  static String pathAdminBusinessPlanReset(String businessId) =>
      '/api2/admin/businesses/$businessId/plan/reset';
  static String pathAdminBusinessAssignments(String businessId) =>
      '/api2/admin/businesses/$businessId/assignments';
  static const String pathAdminChannels = '/api2/admin/channels';
  static const String pathAdminFacebookAuth = '/api2/admin/channels/facebook/auth';
  static String pathAdminFacebookPending(String token) =>
      '/api2/admin/channels/facebook/pending?token=${Uri.encodeComponent(token)}';
  static const String pathAdminFacebookConnect = '/api2/admin/channels/facebook/connect';
  static const String pathAdminOfficialChannels = '/api2/admin/official/channels';
  static String pathAdminOfficialChannelVerify(String id) => '/api2/admin/official/channels/$id/verify';
  static String pathAdminOfficialChannelDisconnect(String id) => '/api2/admin/official/channels/$id/disconnect';
  static const String pathAdminOfficialWhatsAppConnect = '/api2/admin/official/channels/whatsapp/connect';
  static const String pathAdminOfficialSettings = '/api2/admin/official/settings';
  static String pathAdminOfficialConversations({String? platform}) {
    var p = '/api2/admin/official/conversations';
    if (platform != null && platform.isNotEmpty) {
      p += '?platform=${Uri.encodeComponent(platform)}';
    }
    return p;
  }
  static String pathAdminOfficialConversation(String id) => '/api2/admin/official/conversations/$id';
  static String pathAdminOfficialConversationReply(String id) => '/api2/admin/official/conversations/$id/reply';
  static String pathAdminOfficialConversationTakeover(String id) => '/api2/admin/official/conversations/$id/takeover';
  static const String pathAdminOfficialInbox = '/api2/admin/official/inbox';
  static String pathAdminOfficialTickets({String? status, String? type}) {
    var p = '/api2/admin/official/tickets';
    final params = <String>[];
    if (status != null && status.isNotEmpty) params.add('status=${Uri.encodeComponent(status)}');
    if (type != null && type.isNotEmpty) params.add('type=${Uri.encodeComponent(type)}');
    if (params.isNotEmpty) p += '?${params.join('&')}';
    return p;
  }
  static String pathAdminOfficialTicket(String id) => '/api2/admin/official/tickets/$id';
  static String pathAdminOfficialProspects({String? status}) {
    var p = '/api2/admin/official/prospects';
    if (status != null && status.isNotEmpty && status != 'all') {
      p += '?status=${Uri.encodeComponent(status)}';
    }
    return p;
  }
  static String pathAdminOfficialProspect(String id) => '/api2/admin/official/prospects/$id';
  static const String pathAdminOfficialProspectWeights = '/api2/admin/official/prospect-weights';
  static const String pathAdminDefaultAgent = '/api2/admin/default-agent';
  static const String pathAdminDefaultAgentOverrides = '/api2/admin/default-agent/overrides';
  static const String pathAdminDefaultAgentFollow = '/api2/admin/default-agent/overrides/follow';
  static const String pathAdminLogs = '/api2/logs';
  static String pathAdminLogTypes() => '/api2/logs/types';
  static const String pathAdminLogStorage = '/api2/logs/storage';
  static String pathAdminLogsQuery({
    String? type,
    String? start,
    String? end,
    String? cursor,
    int limit = 50,
  }) {
    final params = <String>[];
    if (type != null && type.isNotEmpty) params.add('type=${Uri.encodeComponent(type)}');
    if (start != null && start.isNotEmpty) params.add('start=${Uri.encodeComponent(start)}');
    if (end != null && end.isNotEmpty) params.add('end=${Uri.encodeComponent(end)}');
    if (cursor != null && cursor.isNotEmpty) params.add('cursor=${Uri.encodeComponent(cursor)}');
    params.add('limit=$limit');
    return '$pathAdminLogs?${params.join('&')}';
  }
  static const String pathAdminExportCsv = '/api2/admin/export.csv';
  static const String pathAdminChangePassword = '/api2/admin/password';
  static const String pathAdminMailAttachmentSign = '/api2/admin/mail/attachments/sign';
  static String pathAdminMailAttachment(
          String emailId, String attachmentId) =>
      '/api2/admin/mail/emails/${Uri.encodeComponent(emailId)}/attachments/${Uri.encodeComponent(attachmentId)}';
  static const String pathAdminSubagents = '/api2/admin/subagents';
  static String pathAdminSubagent(String key) => '/api2/admin/subagents/${Uri.encodeComponent(key)}';
  static String pathAdminOfficialTicketNotes(String id) =>
      '/api2/admin/official/tickets/$id/notes';
  static String pathAdminOfficialProspectEvents(String id) =>
      '/api2/admin/official/prospects/$id/events';
  static const String pathAdminOfficialProspectRescore = '/api2/admin/official/prospects/rescore';
}
