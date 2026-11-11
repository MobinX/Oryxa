import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_theme.dart';
import '../../providers/business_provider.dart';
import '../../widgets/app_card.dart';

class StorefrontScreen extends StatefulWidget {
  const StorefrontScreen({super.key});

  @override
  State<StorefrontScreen> createState() => _StorefrontScreenState();
}

class _StorefrontScreenState extends State<StorefrontScreen> {
  String _selectedTheme = 'classic';

  @override
  void initState() {
    super.initState();
    final b = context.read<BusinessProvider>().currentBusiness;
    if (b?.storeTheme != null && b!.storeTheme!.isNotEmpty) {
      _selectedTheme = b.storeTheme!;
    }
  }

  final List<Map<String, String>> _themes = [
    {
      'id': 'classic',
      'name': 'Classic Gallery',
      'desc': 'Warm paper, black ink, clean square cards',
    },
    {
      'id': 'editorial',
      'name': 'Editorial',
      'desc': 'Olive background, serif titles, ruled cards',
    },
    {
      'id': 'market',
      'name': 'Market',
      'desc': 'Clay & cream, rounded tiles, hero banner',
    },
    {
      'id': 'terminal',
      'name': 'Terminal',
      'desc': 'Dark monochrome ink, boxed tiles, modern look',
    },
    {
      'id': 'atelier',
      'name': 'Atelier',
      'desc': 'Espresso & gold luxury styling, centered captions',
    },
  ];

  @override
  Widget build(BuildContext context) {
    final biz = context.watch<BusinessProvider>();
    final b = biz.currentBusiness;
    final slug = b?.slug ?? 'store';
    final storeUrl = 'https://web.oryxa.us/store/$slug';

    return Scaffold(
      appBar: AppBar(title: const Text('Public Storefront')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Public Link Card
          AppCard(
            color: AppTheme.primaryColor.withValues(alpha: 0.08),
            border: BorderSide(color: AppTheme.primaryColor.withValues(alpha: 0.2)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.storefront, color: AppTheme.primaryColor, size: 20),
                    SizedBox(width: 8),
                    Text('Your Live Store Link', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.primaryColor)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  storeUrl,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, fontFamily: 'monospace'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    ElevatedButton.icon(
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: storeUrl));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Store link copied to clipboard!')),
                        );
                      },
                      icon: const Icon(Icons.copy, size: 16),
                      label: const Text('Copy Link'),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton.icon(
                      onPressed: () => launchUrl(Uri.parse(storeUrl)),
                      icon: const Icon(Icons.open_in_new, size: 16),
                      label: const Text('Open Store'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Theme Chooser
          const Text('Storefront Themes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text(
            'Select how your public customer web shop looks. Tap a theme to apply.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 14),

          ..._themes.map((t) {
            final isSelected = _selectedTheme == t['id'];

            return AppCard(
              border: isSelected ? const BorderSide(color: AppTheme.primaryColor, width: 2) : null,
              onTap: () async {
                setState(() => _selectedTheme = t['id']!);
                final ok = await biz.updateStoreTheme(t['id']!);
                if (ok && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Applied theme: ${t["name"]}'), backgroundColor: AppTheme.success),
                  );
                } else if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(biz.errorMessage ?? 'Failed to update theme'),
                      backgroundColor: AppTheme.danger,
                    ),
                  );
                }
              },
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: isSelected ? AppTheme.primaryColor : Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.palette_outlined,
                      color: isSelected ? Colors.white : Colors.grey.shade700,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t['name']!, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 2),
                        Text(t['desc']!, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ],
                    ),
                  ),
                  if (isSelected)
                    const Icon(Icons.check_circle, color: AppTheme.primaryColor),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
