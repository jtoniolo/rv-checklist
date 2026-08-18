# Connecting Claude to the MCP endpoint

The app exposes an MCP (Model Context Protocol) endpoint that gives Claude
access to your rigs, checklists, maintenance tasks, runs, and log entries.
The read surface covers all five; the write surface is scoped to checklists
and maintenance tasks. Runs, log entries, and rig edits stay in the UI.

## Endpoint

```
https://<host>/api/mcp
```

Replace `<host>` with your deployment hostname.

## Token

The endpoint authenticates with a bearer token prefixed `rvmcp_`. Get one
from the **MCP Token** dialog in the avatar menu. The raw token is shown
once — copy it immediately. If you lose it, open the dialog and regenerate;
the old token is revoked and you must paste the new one into every client.

## Scope

The **read** surface covers rigs, checklists, steps, runs, maintenance
tasks, and log entries. The **write** surface is scoped to checklists and
maintenance tasks only — creating, updating, and deleting them. Runs, log
entries, and rigs are read-only. Distance is always in kilometres.

## Claude Code

Add the server from the command line:

```sh
claude mcp add rv-checklist \
  --transport http \
  https://<host>/api/mcp \
  --header "Authorization: Bearer $RV_MCP_TOKEN"
```

Set the `RV_MCP_TOKEN` environment variable to your `rvmcp_…` token, or
paste the token directly in place of `$RV_MCP_TOKEN`.

Alternatively, add it to `.mcp.json` (per-project or global):

```json
{
  "mcpServers": {
    "rv-checklist": {
      "type": "http",
      "url": "https://<host>/api/mcp",
      "headers": {
        "Authorization": "Bearer ${RV_MCP_TOKEN}"
      }
    }
  }
}
```

The `${RV_MCP_TOKEN}` syntax expands the environment variable at runtime.

## Claude Desktop

### With the request-headers beta

If the request-headers beta is enabled on your account, add a custom MCP
connector in Claude Desktop settings:

1. Open **Settings > MCP connectors > Add connector**.
2. Set the URL to `https://<host>/api/mcp`.
3. In the **Request headers** section, add a header with name
   `authorization` and value `Bearer rvmcp_…` (your full token).

### Without the beta (mcp-remote fallback)

If the request-headers beta is not available, use `mcp-remote` as a local
proxy. In your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rv-checklist": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<host>/api/mcp",
        "--header",
        "Authorization:Bearer ${RV_MCP_TOKEN}"
      ]
    }
  }
}
```

Set the `RV_MCP_TOKEN` environment variable to your `rvmcp_…` token before
launching Claude Desktop. Note the `Authorization:Bearer` format (no space
after the colon) — this avoids a Windows argument-splitting issue with
`mcp-remote`.

## claude.ai

claude.ai supports custom MCP connectors with the request-headers beta
only. There is no fallback — without the beta, claude.ai cannot connect.

1. Open **Settings > MCP connectors > Add connector**.
2. Set the URL to `https://<host>/api/mcp`.
3. In the **Request headers** section, add a header with name
   `authorization` and value `Bearer rvmcp_…` (your full token).

Verify the beta is enabled on your account before relying on this surface.

## See also

The Messages API MCP connector (beta `mcp-client-2025-11-20`) also accepts
a static bearer token via `authorization_token` in `mcp_servers` — no OAuth
flow is involved.
