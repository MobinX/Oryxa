-- The suggestion chips moved out of send_message into send_suggestions. Update only the
-- default agent's system prompt; every other column and every merchant row stays untouched.
-- Each replace is a no-op once its span is gone, so the script is safe to run twice.

UPDATE "default_agent"
SET "system_prompt" = replace(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              "system_prompt",
              $old1$Your normal final text is delivered automatically, but whenever you want to offer the customer choices, send the question through `send_message({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call. `suggestions` may be null when there are no choices, which simply sends the message.$old1$,
              $new1$Your normal final text is delivered automatically. `send_message` sends a plain text message and takes no suggestions. Whenever you want to offer the customer choices, send the question through `send_suggestions({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call.$new1$
            ),
            $old2$After `send_message` returns `sent: true`$old2$,
            $new2$After `send_suggestions` returns `sent: true`$new2$
          ),
          $old3$send_message({ message: "Which color would you like?", suggestions: ["Red", "Green", "Blue"] })$old3$,
          $new3$send_suggestions({ message: "Which color would you like?", suggestions: ["Red", "Green", "Blue"] })$new3$
        ),
        $old4$send_message({ message: "Which category should I show you?", suggestions: ["T-Shirts", "Hoodies", "Accessories"] })$old4$,
        $new4$send_suggestions({ message: "Which category should I show you?", suggestions: ["T-Shirts", "Hoodies", "Accessories"] })$new4$
      ),
      $old5$send_message({ message: "Which size would you like?", suggestions: ["S", "M", "L", "XL"] })$old5$,
      $new5$send_suggestions({ message: "Which size would you like?", suggestions: ["S", "M", "L", "XL"] })$new5$
    ),
    $old6$send_message({ message: "How many would you like?", suggestions: ["1", "2", "3"] })$old6$,
    $new6$send_suggestions({ message: "How many would you like?", suggestions: ["1", "2", "3"] })$new6$
  ),
  $old7$send_message({ message: "You are welcome!", suggestions: null })$old7$,
  $new7$send_message({ message: "You are welcome!" })$new7$
)
WHERE position($guard$send_message({ message, suggestions })$guard$ in "system_prompt") > 0;
--> statement-breakpoint
UPDATE "default_agent"
SET "system_prompt" = replace(
  "system_prompt",
  $old8$send_message({ message: "Which category should I show you?", suggestions: [...] })$old8$,
  $new8$send_suggestions({ message: "Which category should I show you?", suggestions: [...] })$new8$
)
WHERE position($guard2$send_message({ message: "Which category should I show you?", suggestions: [...] })$guard2$ in "system_prompt") > 0;
--> statement-breakpoint
-- Repair for a database where the first pass ran before the wording was aligned with
-- the code seed: make the intro exactly the sentence the code now carries.
UPDATE "default_agent"
SET "system_prompt" = replace(
  "system_prompt",
  $old9$Your normal final text is delivered automatically, but whenever you want to offer the customer choices, send the question through `send_suggestions({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call. `send_message` sends plain text only and takes no suggestions.$old9$,
  $new9$Your normal final text is delivered automatically. `send_message` sends a plain text message and takes no suggestions. Whenever you want to offer the customer choices, send the question through `send_suggestions({ message, suggestions })` instead: the message and its tappable answer chips go out in ONE tool call.$new9$
);
