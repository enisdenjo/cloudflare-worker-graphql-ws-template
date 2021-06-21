import { makeServer } from 'graphql-ws/lib/index.mjs' // TODO-db-210621 use es modules by default
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
function useWebsocket(socket, request, protocol) {
  // configure and make server
  const server = makeServer({ schema, roots })

  // accept socket to begin
  socket.accept()

  // use the server
  const closed = server.opened(
    {
      protocol, // will be validated
      send: data => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: cb =>
        socket.addEventListener('message', async event => {
          try {
            // wait for the the operation to complete
            // - if init message, waits for connect
            // - if query/mutation, waits for result
            // - if subscription, waits for complete
            await cb(event.data)
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
  socket.addEventListener('close', (code, reason) => closed(code, reason))
}

function handleRequest(request) {
  try {
    const url = new URL(request.url)
    switch (url.pathname) {
      case '/':
        return template() // render graphiql
      case '/graphql':
        const upgradeHeader = request.headers.get('Upgrade')
        if (upgradeHeader !== 'websocket') {
          return new Response('Expected websocket', { status: 400 })
        }

        const [client, server] = Object.values(new WebSocketPair())

        // the server socket object does not have the protocol prop, extract it from the header
        const subprotocol = request.headers.get('Sec-WebSocket-Protocol')

        useWebsocket(server, request, subprotocol)

        return new Response(null, {
          status: 101,
          webSocket: client,
          headers: {
            // As per the WS spec, if the server does not accept the subprotocol - it should omit this header.
            // HOWEVER, if the server does not respond with the same header value here, Chrome will abruptly
            // terminate the connection with a 1006 code. so, we intentionally respond with the same header
            // and have graphql-ws gracefully close the socket for an invalid protocol with a 1002 code in order
            // for the client to be able to detect that the issue is with the subprotocol and not something else.
            'Sec-WebSocket-Protocol': subprotocol,
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
