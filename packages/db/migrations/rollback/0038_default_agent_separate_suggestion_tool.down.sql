UPDATE "default_agent"
SET "system_prompt" = replace(
  replace(
    "system_prompt",
    $new1$send the question through `send_suggestions({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call. `send_message` sends plain text only and takes no suggestions.$new1$,
    $old1$send the question through `send_message({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call. `suggestions` may be null when there are no choices, which simply sends the message.$old1$
  ),
  $new2$After `send_suggestions` returns `sent: true`$new2$,
  $old2$After `send_message` returns `sent: true`$old2$
);
UPDATE "default_agent"
SET "system_prompt" = replace("system_prompt", 'send_suggestions({ message:', 'send_message({ message:');
UPDATE "default_agent"
SET "system_prompt" = replace(
  "system_prompt",
  'send_message({ message: "You are welcome!" })',
  'send_message({ message: "You are welcome!", suggestions: null })'
);
