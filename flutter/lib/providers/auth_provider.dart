import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService authService;
  bool _isLoading = false;
  String? _errorMessage;

  AuthProvider({required this.authService}) {
    authService.addListener(notifyListeners);
  }

  @override
  void dispose() {
    authService.removeListener(notifyListeners);
    super.dispose();
  }

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => authService.isAuthenticated;
  UserModel? get user => authService.currentUser;
  String? get selectedBusinessId => authService.selectedBusinessId;

  Future<bool> login(String email, String password, {String? customToken}) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await authService.login(email: email, password: password, customToken: customToken);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('ApiException: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<void> selectBusiness(String businessId) async {
    await authService.setSelectedBusinessId(businessId);
    notifyListeners();
  }

  Future<bool> loginWithGoogle() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await authService.loginWithGoogle();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('ApiException: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await authService.logout();
    notifyListeners();
  }
}
