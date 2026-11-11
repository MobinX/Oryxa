import 'package:flutter/material.dart';
import '../../config/app_theme.dart';
import '../../widgets/app_card.dart';

class PlaygroundScreen extends StatefulWidget {
  const PlaygroundScreen({super.key});

  @override
  State<PlaygroundScreen> createState() => _PlaygroundScreenState();
}

class _PlaygroundScreenState extends State<PlaygroundScreen> {
  final _messageController = TextEditingController();
  final List<Map<String, dynamic>> _messages = [
    {
      'from': 'agent',
      'text': 'Hello! I am your OnlyOrders AI Sales Agent. How can I assist you with your shopping today?',
      'time': 'Just now',
    },
  ];
  bool _isTyping = false;
  String _customerPersona = 'Oliver Queen';

  final List<String> _personas = [
    'Oliver Queen',
    'Bruce Wayne',
    'Diana Prince',
    'Clark Kent',
    'Selina Kyle',
  ];

  void _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    _messageController.clear();
    setState(() {
      _messages.add({
        'from': 'user',
        'text': text,
        'time': '${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
      });
      _isTyping = true;
    });

    // Simulate AI LangGraph + Gemini Agent response
    await Future.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;

    String reply;
    String? toolCall;

    final lower = text.toLowerCase();
    if (lower.contains('price') || lower.contains('cost') || lower.contains('how much')) {
      toolCall = 'tool: search_catalog(query: "$text")';
      reply = 'We have items starting from ৳450! Would you like me to check stock for a specific size or color?';
    } else if (lower.contains('order') || lower.contains('buy')) {
      toolCall = 'tool: get_order_defaults(customer: "$_customerPersona")';
      reply = 'I can help you place that order right away! Please confirm your delivery address and contact number.';
    } else if (lower.contains('delivery') || lower.contains('dhaka')) {
      toolCall = 'tool: get_delivery_zones()';
      reply = 'Standard delivery inside Dhaka is ৳60 (24-48 hours), and outside Dhaka is ৳120 via courier.';
    } else {
      reply = 'I understand! Let me check that in our store catalog for you.';
    }

    setState(() {
      _isTyping = false;
      _messages.add({
        'from': 'agent',
        'text': reply,
        'tool': toolCall,
        'time': '${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
      });
    });
  }

  void _resetChat() {
    setState(() {
      _messages.clear();
      _messages.add({
        'from': 'agent',
        'text': 'Hello! I am your OnlyOrders AI Sales Agent. How can I assist you with your shopping today?',
        'time': 'Just now',
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Agent Playground'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Reset Conversation',
            onPressed: _resetChat,
          ),
        ],
      ),
      body: Column(
        children: [
          // Persona bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
            child: Row(
              children: [
                const Icon(Icons.psychology, size: 20, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                const Text('Testing Customer Persona:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                const Spacer(),
                DropdownButton<String>(
                  value: _customerPersona,
                  underline: const SizedBox(),
                  isDense: true,
                  items: _personas.map((p) => DropdownMenuItem(value: p, child: Text(p, style: const TextStyle(fontSize: 12)))).toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _customerPersona = v);
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Chat messages
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final m = _messages[index];
                final isAgent = m['from'] == 'agent';

                return Align(
                  alignment: isAgent ? Alignment.centerLeft : Alignment.centerRight,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isAgent
                          ? (isDark ? AppTheme.cardDark : Colors.white)
                          : AppTheme.primaryColor,
                      borderRadius: BorderRadius.circular(16),
                      border: isAgent ? Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight) : null,
                    ),
                    child: Column(
                      crossAxisAlignment: isAgent ? CrossAxisAlignment.start : CrossAxisAlignment.end,
                      children: [
                        if (isAgent) ...[
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.smart_toy, size: 14, color: AppTheme.primaryColor),
                              const SizedBox(width: 6),
                              const Text('AI Sales Agent', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                            ],
                          ),
                          const SizedBox(height: 6),
                        ],
                        if (m['tool'] != null) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            margin: const EdgeInsets.only(bottom: 6),
                            decoration: BoxDecoration(
                              color: Colors.amber.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.build_circle_outlined, size: 12, color: Colors.amber),
                                const SizedBox(width: 4),
                                Text(
                                  m['tool']!,
                                  style: const TextStyle(fontSize: 10, fontFamily: 'monospace', fontWeight: FontWeight.bold, color: Colors.amber),
                                ),
                              ],
                            ),
                          ),
                        ],
                        Text(
                          m['text']!,
                          style: TextStyle(
                            color: isAgent ? (isDark ? Colors.white : Colors.black87) : Colors.white,
                            fontSize: 14,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          if (_isTyping)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 8),
                  Text('AI is thinking & calling tools...', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ],
              ),
            ),

          // Input bar
          Container(
            padding: const EdgeInsets.all(12),
            color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Simulate customer question...',
                      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.send, size: 18),
                  style: IconButton.styleFrom(backgroundColor: AppTheme.primaryColor),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
