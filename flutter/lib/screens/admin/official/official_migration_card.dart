import 'package:flutter/material.dart';

/// The API answers 503 `official_channels_not_migrated` when migration 0036 has not
/// been applied. The web console renders a card; mobile shows the same state.
class OfficialMigrationCard extends StatelessWidget {
  const OfficialMigrationCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.amber.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Colors.amber, width: 1.2),
      ),
      child: const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 18),
                SizedBox(width: 8),
                Text('Official channels migration pending',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              ],
            ),
            SizedBox(height: 6),
            Text(
              'This deployment has not applied the official-channels migration yet. '
              'No official channel, inbox, ticket or prospect can be read until it is applied.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
