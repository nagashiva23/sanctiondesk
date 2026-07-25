# SanctionDesk Demo Login

A hardcoded-credential login page for presenting SanctionDesk's manager
tier at a hackathon. Purely client-side: it looks up a pre-minted manager
token from a local table and displays it -- it never signs anything and
never holds `JWT_SECRET`. This is presentation UX, not a real auth system.

Two-tier model: a **client** is anyone chatting with the deployed MCP
server directly -- no login, no token, nothing to configure. A **manager**
logs in here to get their token. There is no further role to pick.

## Setup (do this before each demo)

Tokens expire in 24h, so regenerate them the morning of the demo:

```bash
cp data/personas.example.ts data/personas.ts   # first time only, gitignored after
cd ..  # repo root
node scripts/mint-team-tokens.mjs alice bob
```

Paste each printed token into the matching persona's `token` field in
`data/personas.ts`.

## Run

```bash
npm install
npm run dev   # http://localhost:3002
```

Log in with any of the hardcoded username/password pairs in
`data/personas.ts` (default password for all of them is `demo123` --
change it there if you want). The dashboard shows what a manager can do,
their token (with a copy button), and the one-time chat-client instruction
text needed so a pasted token actually gets attached to tool calls (see the
main README's "Using role tokens from a chat client" section).
