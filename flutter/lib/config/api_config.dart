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
  static String pathBusinessSearch(String businessId, String query) =>
      '/businesses/$businessId/search?q=${Uri.encodeComponent(query)}';

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
  static String pathNotifications(String businessId) =>
      '/$businessId/notifications';
  static String pathTokenAnalytics(String businessId) =>
      '/$businessId/token-analytics';

  static String pathPosts(String businessId) =>
      '/$businessId/posts';
  static String pathAds(String businessId, {int days = 30}) =>
      '/$businessId/ads?days=$days';
}
