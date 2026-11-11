import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/business_provider.dart';
import '../../widgets/app_card.dart';
import 'ota_update_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _aiPromptController = TextEditingController(
    text: 'You are a warm, polite, and persuasive Bangladeshi e-commerce sales closer. Answer customer inquiries in Bengali/Banglish, recommend fitting products, offer polite suggestions, and close orders smoothly.',
  );

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final b = context.read<BusinessProvider>().currentBusiness;
    if (b != null) {
      _nameController.text = b.name;
      _descController.text = b.description ?? '';
      _phoneController.text = b.phone ?? '';
      _emailController.text = b.email ?? '';
      _addressController.text = b.address ?? '';
      if (b.agentProductGuidance != null && b.agentProductGuidance!.isNotEmpty) {
        _aiPromptController.text = b.agentProductGuidance!;
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _aiPromptController.dispose();
    super.dispose();
  }

  void _save() async {
    setState(() => _isSaving = true);
    final biz = context.read<BusinessProvider>();
    final ok = await biz.updateBusinessSettings(
      name: _nameController.text.trim(),
      description: _descController.text.trim(),
      phone: _phoneController.text.trim(),
      email: _emailController.text.trim(),
      address: _addressController.text.trim(),
      agentProductGuidance: _aiPromptController.text.trim(),
    );
    setState(() => _isSaving = false);

    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Settings saved successfully!'), backgroundColor: AppTheme.success),
      );
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(biz.errorMessage ?? 'Failed to save settings'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Store & AI Settings')),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.2))),
        ),
        child: SafeArea(
          child: ElevatedButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : const Text('Save Settings'),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Business Profile
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Business Profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 12),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Store Name *'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _descController,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Store Description'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Official Contact Phone'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Support Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _addressController,
                  decoration: const InputDecoration(labelText: 'Store Pickup / Warehouse Address'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // AI Agent Personality & Instructions
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.psychology, color: AppTheme.primaryColor, size: 20),
                    SizedBox(width: 8),
                    Text('AI Sales Persona & Guidance', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Customize how your Gemini AI agent talks to customers, handles objections, and closes deals.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _aiPromptController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'System Instructions & Persona Brief',
                    hintText: 'Enter AI behavior instructions...',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // OTA Remote Patches Shortcut
          AppCard(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const OtaUpdateScreen()),
              );
            },
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.system_update_alt, color: AppTheme.primaryColor),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Cloudflare OTA Updates', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      SizedBox(height: 2),
                      Text('Check for over-the-air patches & updates', style: TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: Colors.grey),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
