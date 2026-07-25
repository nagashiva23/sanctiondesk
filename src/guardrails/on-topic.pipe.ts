import { Pipe, PipeInterface, ArgumentMetadata } from '@nitrostack/core';

/**
 * This is defense-in-depth, not the primary control. A NitroStack MCP
 * server can only ever inspect actual tool-call arguments -- if a client's
 * LLM just answers "here's some Java collections code" from its own
 * knowledge without calling any of our tools, that reply never touches
 * this server and nothing here can stop it. That has to be handled at the
 * client/system-prompt level (see the note added to underwriter_review and
 * the recommendation to set NitroStudio's "AI Behavior" instructions).
 *
 * What this DOES catch: someone stuffing an off-topic request or a prompt
 * injection into one of our own free-text fields (applicantName,
 * justification, a policy versionLabel, a debug note) to get the model to
 * act on it while "inside" a tool call.
 */
const OFF_TOPIC_SIGNALS: RegExp[] = [
  /ignore (all |any )?(previous|prior|above|earlier) instructions/i,
  /disregard (all |any )?(previous|prior|above|earlier) instructions/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /\bnew instructions?:/i,
  /\b(java|python|javascript|typescript|c\+\+|c#|rust|golang|go|kotlin|swift|php|ruby|scala|sql)\b.*\b(code|collections?|arraylist|hashmap|linkedlist|function|script|program|snippet|algorithm|class|library|framework|syntax|tutorial)\b/i,
  /\bwrite (me |us )?(a|some|the) (code|program|script|function|algorithm|essay|poem|story|recipe)\b/i,
  /\breact\b.*\b(component|hook|app)\b/i,
  /\bhow (do|to) I (write|implement|code|build|create) (a|an|the)\b/i,
  /\bexplain (how|what)\b.*\b(programming|algorithm|framework|library|api|database|network)\b/i,
  /\bteach me\b/i,
  /\bwhat is the capital of\b/i,
  /\btell me a joke\b/i,
  /\bunrelated to (loan|underwriting|this)\b/i,
  /\bpretend (you are|to be)\b/i,
  /\bact as (a|an)\b/i,
];

export class OffTopicInputError extends Error {
  constructor(field: string) {
    super(
      `The value in "${field}" doesn't look related to a loan application and was rejected. This server only handles loan underwriting -- questions about programming, other topics, or attempts to change these instructions belong outside this tool.`,
    );
    this.name = 'OffTopicInputError';
  }
}

@Pipe()
export class OnTopicPipe implements PipeInterface<Record<string, unknown>, Record<string, unknown>> {
  transform(value: Record<string, unknown>, _metadata: ArgumentMetadata): Record<string, unknown> {
    scan(value);
    return value;
  }
}

function scan(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    for (const pattern of OFF_TOPIC_SIGNALS) {
      if (pattern.test(value)) throw new OffTopicInputError(path || 'input');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) scan(v, path ? `${path}.${key}` : key);
  }
}
