import { makeServer, MessageType, stringifyMessage } from 'graphql-ws';
import { buildSchema } from 'graphql';
import graphiql from './graphiql';

// construct a schema, using GraphQL schema language
const schema = buildSchema(`
  type Query {
    hello: String
  }
  type Subscription {
    greetings: String
  }
`);

// the roots provide resolvers for each GraphQL operation
const roots = {
  query: {
    hello: () => 'Hello World!',
  },
  subscription: {
    greetings: async function* sayHiIn5Languages() {
      for (const hi of ['Hi', 'Bonjour', 'Hola', 'Ciao', 'Zdravo']) {
        yield { greetings: hi };
      }
    },
  },
};

// use cloudflare server websocket for graphql-ws
function useWebsocket(socket, request, protocol) {
  // configure and make server
  const server = makeServer({ schema, roots });

  // accept socket to begin
  socket.accept();

  // subprotocol pinger because WS level ping/pongs are not be available
  let pinger, pongWait;
  function ping() {
    if (socket.readyState === socket.OPEN) {
      // send the subprotocol level ping message
      socket.send(stringifyMessage({ type: MessageType.Ping }));

      // wait for the pong for 6 seconds and then terminate
      pongWait = setTimeout(() => {
        clearInterval(pinger);
        socket.close();
      }, 6000);
    }
  }

  // ping the client on an interval every 12 seconds
  pinger = setInterval(() => ping(), 12000);

  // use the server
  const closed = server.opened(
    {
      protocol, // will be validated
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: (cb) =>
        socket.addEventListener('message', async (event) => {
          try {
            // wait for the the operation to complete
            // - if init message, waits for connect
            // - if query/mutation, waits for result
            // - if subscription, waits for complete
            await cb(event.data);
          } catch (err) {
            // all errors that could be thrown during the
            // execution of operations will be caught here
            socket.close(1011, err.message);
          }
        }),
      // pong received, clear termination timeout
      onPong: () => clearTimeout(pongWait),
    },
    // pass values to the `extra` field in the context
    { socket, request },
  );

  // notify server that the socket closed and stop the pinger
  socket.addEventListener('close', (code, reason) => {
    clearTimeout(pongWait);
    clearInterval(pinger);
    closed(code, reason);
  });
}

function handleRequest(request) {
  const url = new URL(request.url);
  switch (url.pathname) {
    case '/':
      return graphiql();
    case '/graphql':
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }

      const [client, server] = Object.values(new WebSocketPair());

      // the server socket object does not have the protocol prop, extract it from the header
      const subprotocol = request.headers.get('Sec-WebSocket-Protocol');

      useWebsocket(server, request, subprotocol);

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
      });
    default:
      return new Response('Not found', { status: 404 });
  }
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});
