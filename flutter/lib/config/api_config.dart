class ApiConfig {
  /// Default backend URL.
  /// On local dev: http://10.0.2.2:3001 (Android Emulator) or http://localhost:3001
  /// In production / cloud: https://web.oryxa.us/api/v1
  static const String defaultBaseUrl = 'https://web.oryxa.us/api/v1';
  static const String devLocalBaseUrl = 'http://10.0.2.2:3001/api/v1';

  // Storage key for custom base URL
  static const String storageKeyBaseUrl = 'api_base_url';
  static const String storageKeyToken = 'auth_token';
  static const String storageKeySelectedBusiness = 'selected_business_id';
  static const String storageKeyUser = 'user_data';

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

  static String pathMessages(String businessId, String conversationId, {int limit = 100}) =>
      '/$businessId/conversations/$conversationId/messages?limit=$limit';
  static String pathSendMessage(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/messages';
  static String pathAutopilot(String businessId, String conversationId) =>
      '/$businessId/conversations/$conversationId/autopilot';
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
      p += '&search=${Uri.encodeComponent(search)}';
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
