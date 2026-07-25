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
  /\b(java|python|javascript|typescript|c\+\+|rust|golang)\b.*\b(code|collections?|arraylist|hashmap|function|script|program|snippet|algorithm)\b/i,
  /\bwrite (me |us )?(a|some|the) (code|program|script|function|algorithm)\b/i,
  /\breact\b.*\bcomponent\b/i,
  /\bhow (do|to) I (write|implement|code)\b/i,
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
