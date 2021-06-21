import { makeServer, GRAPHQL_TRANSPORT_WS_PROTOCOL } from 'graphql-ws'
import { buildSchema } from 'graphql'
import template from './template'

// construct a schema, using GraphQL schema language
const schema = buildSchema(`
  type Query {
    hello: String
  }
  type Subscription {
    greetings: String
  }
`)

// the roots provide resolvers for each GraphQL operation
const roots = {
  query: {
    hello: () => 'Hello World!',
  },
  subscription: {
    greetings: async function* sayHiIn5Languages() {
      for (const hi of ['Hi', 'Bonjour', 'Hola', 'Ciao', 'Zdravo']) {
        yield { greetings: hi }
      }
    },
  },
}

// use cloudflare server websocket for graphql-ws
function useWebsocket(socket, request) {
  // configure and make server
  const server = makeServer({ schema, roots })

  // accept socket to begin
  socket.accept()

  // use the server
  const closed = server.opened(
    {
      protocol: socket.protocol, // will be validated
      send: data =>
        new Promise((resolve, reject) => {
          socket.send(data, err => (err ? reject(err) : resolve()))
        }), // control your data flow by timing the promise resolve
      close: (code, reason) => socket.close(code, reason), // there are protocol standard closures
      onMessage: cb =>
        socket.on('message', async event => {
          try {
            // wait for the the operation to complete
            // - if init message, waits for connect
            // - if query/mutation, waits for result
            // - if subscription, waits for complete
            await cb(event.toString())
          } catch (err) {
            // all errors that could be thrown during the
            // execution of operations will be caught here
            socket.close(1011, err.message)
          }
        }),
    },
    // pass values to the `extra` field in the context
    { socket, request },
  )

  // notify server that the socket closed
  socket.once('close', (code, reason) => closed(code, reason))
}

function handleRequest(request) {
  try {
    const url = new URL(request.url)
    switch (url.pathname) {
      case '/':
        return template()
      case '/graphql':
        const upgradeHeader = request.headers.get('Upgrade')
        if (upgradeHeader !== 'websocket') {
          return new Response('Expected websocket', { status: 400 })
        }

        let acceptSubprotocol = request.headers.get('Sec-WebSocket-Protocol')
        if (acceptSubprotocol !== GRAPHQL_TRANSPORT_WS_PROTOCOL) {
          // if the subprotcol requested by the client is not acceptable, return null in the header
          acceptSubprotocol = null
        }

        const [client, server] = Object.values(new WebSocketPair())
        useWebsocket(server, request)

        return new Response(null, {
          status: 101,
          webSocket: client,
          headers: {
            'Sec-WebSocket-Protocol': acceptSubprotocol,
          },
        })
      default:
        return new Response('Not found', { status: 404 })
    }
  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
