import { app } from "./app";
import type { Env } from "./types";
import { ensureMailbox, findInboundDuplicate, persistEmail } from "./lib/store";
import { MimeParseError, parseInboundEmail } from "./lib/mime";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return await app.fetch(request, env, ctx);
  },

  async email(
    message: ForwardableEmailMessage,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const recipient = message.to.trim().toLowerCase();
    if (!recipient) {
      message.setReject("Missing recipient address");
      return;
    }

    let parsed;
    try {
      parsed = await parseInboundEmail(message.raw, message.from, recipient);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "inbound_parse_failed",
          error: error instanceof MimeParseError ? error.message : String(error),
          from: message.from,
          to: recipient,
        }),
      );
      message.setReject("Message could not be parsed");
      return;
    }

    const recipientName =
      parsed.to.find((address) => address.email === recipient)?.name ||
      parsed.to[0]?.name ||
      undefined;
    const mailbox = await ensureMailbox(env, recipient, recipientName);

    if (parsed.messageId) {
      const duplicate = await findInboundDuplicate(env, mailbox.id, parsed.messageId);
      if (duplicate) {
        console.log(
          JSON.stringify({
            event: "inbound_duplicate",
            emailId: duplicate,
            mailboxId: mailbox.id,
            messageId: parsed.messageId,
          }),
        );
        return;
      }
    }

    const result = await persistEmail(env, {
      mailboxId: mailbox.id,
      direction: "inbound",
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      replyTo: parsed.replyTo,
      subject: parsed.subject,
      date: parsed.date,
      receivedAt: new Date().toISOString(),
      text: parsed.text,
      html: parsed.html,
      headers: parsed.headers,
      attachments: parsed.attachments.map((attachment) => ({
        id: crypto.randomUUID(),
        filename: attachment.filename,
        contentType: attachment.contentType,
        disposition: attachment.disposition,
        contentId: attachment.contentId,
        content: attachment.content,
      })),
      provider: "cloudflare-email-routing",
      providerRawSize: message.rawSize,
      status: "received",
    });

    console.log(
      JSON.stringify({
        event: "inbound_stored",
        emailId: result.row.id,
        mailboxId: mailbox.id,
        attachments: result.row.attachment_count,
        sizeBytes: result.row.size_bytes,
      }),
    );
  },
};
