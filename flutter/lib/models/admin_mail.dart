class MailboxInfo {
  final String id;
  final String address;
  final String? name;

  const MailboxInfo({
    required this.id,
    required this.address,
    this.name,
  });

  factory MailboxInfo.fromJson(Map<String, dynamic> json) {
    return MailboxInfo(
      id: (json['id'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      name: json['name']?.toString(),
    );
  }
}

class MailAddress {
  final String email;
  final String name;

  const MailAddress({required this.email, required this.name});

  factory MailAddress.fromJson(dynamic json) {
    if (json is String) {
      return MailAddress(email: json, name: json);
    }
    if (json is Map) {
      return MailAddress(
        email: (json['email'] ?? '').toString(),
        name: (json['name'] ?? json['email'] ?? '').toString(),
      );
    }
    return const MailAddress(email: '', name: '');
  }

  String get display => name.isNotEmpty && name != email ? '$name <$email>' : email;
}

class MailAttachment {
  final String id;
  final String filename;
  final String contentType;
  final int size;
  final String disposition;
  final String? contentId;

  const MailAttachment({
    required this.id,
    required this.filename,
    required this.contentType,
    required this.size,
    this.disposition = 'attachment',
    this.contentId,
  });

  factory MailAttachment.fromJson(Map<String, dynamic> json) {
    return MailAttachment(
      id: (json['id'] ?? '').toString(),
      filename: (json['filename'] ?? 'file').toString(),
      contentType: (json['contentType'] ?? 'application/octet-stream').toString(),
      size: (json['size'] as num?)?.toInt() ?? 0,
      disposition: (json['disposition'] ?? 'attachment').toString(),
      contentId: json['contentId']?.toString(),
    );
  }

  String get formattedSize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(1)} KB';
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class MailRow {
  final String id;
  final String mailboxId;
  final String direction; // 'inbound' | 'outbound'
  final MailAddress from;
  final String toEmail;
  final String subject;
  final int sizeBytes;
  final int attachmentCount;
  final String status;
  final bool isTrashed;
  final bool isSpam;
  final String? receivedAt;
  final String createdAt;

  const MailRow({
    required this.id,
    required this.mailboxId,
    required this.direction,
    required this.from,
    required this.toEmail,
    required this.subject,
    required this.sizeBytes,
    required this.attachmentCount,
    required this.status,
    required this.isTrashed,
    required this.isSpam,
    this.receivedAt,
    required this.createdAt,
  });

  bool get isInbound => direction == 'inbound';
  bool get hasAttachments => attachmentCount > 0;

  DateTime get date {
    final raw = receivedAt ?? createdAt;
    try {
      return DateTime.parse(raw);
    } catch (_) {
      return DateTime.now();
    }
  }

  factory MailRow.fromJson(Map<String, dynamic> json) {
    return MailRow(
      id: (json['id'] ?? '').toString(),
      mailboxId: (json['mailbox_id'] ?? '').toString(),
      direction: (json['direction'] ?? 'inbound').toString(),
      from: MailAddress.fromJson(json['from']),
      toEmail: (json['to_email'] ?? '').toString(),
      subject: (json['subject'] ?? '(no subject)').toString(),
      sizeBytes: (json['size_bytes'] as num?)?.toInt() ?? 0,
      attachmentCount: (json['attachment_count'] as num?)?.toInt() ?? 0,
      status: (json['status'] ?? 'received').toString(),
      isTrashed: json['is_trashed'] == true,
      isSpam: json['is_spam'] == true,
      receivedAt: json['received_at']?.toString(),
      createdAt: (json['created_at'] ?? '').toString(),
    );
  }
}

class MailContent {
  final String id;
  final String mailboxId;
  final String direction;
  final MailAddress from;
  final List<MailAddress> to;
  final List<MailAddress> cc;
  final List<MailAddress> bcc;
  final String subject;
  final String date;
  final String text;
  final String html;
  final List<MailAttachment> attachments;
  final int sizeBytes;

  const MailContent({
    required this.id,
    required this.mailboxId,
    required this.direction,
    required this.from,
    required this.to,
    required this.cc,
    required this.bcc,
    required this.subject,
    required this.date,
    required this.text,
    required this.html,
    required this.attachments,
    required this.sizeBytes,
  });

  factory MailContent.fromJson(Map<String, dynamic> json) {
    final toList = <MailAddress>[];
    if (json['to'] is List) {
      for (final a in json['to'] as List) {
        toList.add(MailAddress.fromJson(a));
      }
    }
    final ccList = <MailAddress>[];
    if (json['cc'] is List) {
      for (final a in json['cc'] as List) {
        ccList.add(MailAddress.fromJson(a));
      }
    }
    final bccList = <MailAddress>[];
    if (json['bcc'] is List) {
      for (final a in json['bcc'] as List) {
        bccList.add(MailAddress.fromJson(a));
      }
    }
    final attachList = <MailAttachment>[];
    if (json['attachments'] is List) {
      for (final a in json['attachments'] as List) {
        if (a is Map<String, dynamic>) {
          attachList.add(MailAttachment.fromJson(a));
        }
      }
    }

    return MailContent(
      id: (json['id'] ?? '').toString(),
      mailboxId: (json['mailboxId'] ?? json['mailbox_id'] ?? '').toString(),
      direction: (json['direction'] ?? 'inbound').toString(),
      from: MailAddress.fromJson(json['from']),
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject: (json['subject'] ?? '').toString(),
      date: (json['date'] ?? '').toString(),
      text: (json['text'] ?? '').toString(),
      html: (json['html'] ?? '').toString(),
      attachments: attachList,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
    );
  }
}

class MailStorageInfo {
  final int usedBytes;
  final int? quotaBytes;

  const MailStorageInfo({required this.usedBytes, this.quotaBytes});

  factory MailStorageInfo.fromJson(Map<String, dynamic> json) {
    return MailStorageInfo(
      usedBytes: (json['used_bytes'] ?? json['usedBytes'] as num?)?.toInt() ?? 0,
      quotaBytes: (json['quota_bytes'] ?? json['quotaBytes'] as num?)?.toInt(),
    );
  }

  String get formattedUsed {
    if (usedBytes < 1024) return '$usedBytes B';
    if (usedBytes < 1024 * 1024) return '${(usedBytes / 1024).toStringAsFixed(1)} KB';
    return '${(usedBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
