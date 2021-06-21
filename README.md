# [🚡 `graphql-ws`](https://github.com/enisdenjo/graphql-ws) on [Cloudflare Workers](https://workers.cloudflare.com/)

A template for [WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets) powered Cloudflare Worker project using graphql-ws.

The worker serves the following routes:

- `"/"` renders GraphiQL using only `graphql-ws` ([as showcased here](https://gist.github.com/enisdenjo/a68312878fdc4df299cb0433c60c1dea))
- `"/graphql"` serves the GraphQL over WebSocket

## Getting started

This template is meant to be used with [Wrangler](https://github.com/cloudflare/wrangler). If you are not already familiar with the tool, we recommend that you install the tool and configure it to work with your [Cloudflare account](https://dash.cloudflare.com). Documentation can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler/).

To generate using Wrangler, run this command:

```bash
wrangler generate my-graphql-ws https://github.com/enisdenjo/cloudflare-worker-graphql-ws-template
```

## Gotchas

- Server WebSocket instance does not contain the `protocol` property ([as `ws` does](https://github.com/websockets/ws/blob/145480a5b520ee951d848009d51069bfd7ed928c/lib/websocket.js#L115-L120)) which is why you should pass the `Sec-WebSocket-Protocol` header to the `graphql-ws` server
- Message listener event `data` property is already a string
- Responding with the same `Sec-WebSocket-Protocol` header is necessary for Chrome otherwise it will abruptly terminate the connection with a `1006` close event code
- `webpack.config.js` is configured to omit the `browser` entry field in `package.json`s since we are bundling for Node workers and not for browsers

  _This is especially necessary for `graphql-ws` since the `browser` bundle does NOT contain any server code._
