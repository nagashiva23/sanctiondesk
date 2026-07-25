/**
 * Fail-fast startup checks, run once before the MCP server starts
 * listening. A misconfigured JWT_REQUIRED=true deployment should refuse to
 * start rather than silently deny every role-scoped tool call at request
 * time -- resolveAuthContext (token.ts) already fails closed (returns no
 * scopes) if JWT_SECRET is missing, but discovering that only when the
 * first real call comes in is a production debugging nightmare. This makes
 * the misconfiguration impossible to miss.
 */
export function validateEnv(): void {
  if (process.env.JWT_REQUIRED === 'true' && !process.env.JWT_SECRET) {
    throw new Error(
      'JWT_REQUIRED=true but JWT_SECRET is not set. Every role-scoped tool call ' +
        '(and every case-access token check) would be silently denied. Set JWT_SECRET ' +
        'to a long random value before starting the server in this mode.',
    );
  }
}
