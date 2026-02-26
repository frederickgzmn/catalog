# GraphQL Client Compatibility Guide

This document outlines how different GraphQL clients can work with our SSE-2 GraphQL-SSE implementation.

## Overview

Our SSE-2 implementation follows the [GraphQL over Server-Sent Events Protocol](https://github.com/enisdenjo/graphql-sse/blob/master/PROTOCOL.md), which is **not natively supported** by most GraphQL clients out-of-the-box. However, all major clients can be made compatible with custom adapters or links.

## Compatibility Matrix

| Client | Native SSE Support | Custom Link Required | Effort Level | Status |
|--------|-------------------|---------------------|--------------|---------|
| **Apollo Client** | ❌ No | ✅ Yes | Medium | ✅ **Production Ready** |
| **Urql** | ❌ No | ✅ Yes | Medium | 🚧 **Planned** |
| **Relay** | ❌ No | ✅ Yes | High | 🚧 **Planned** |
| **graphql-request** | ❌ No | ✅ Yes | Low | 🚧 **Planned** |
| **Vanilla Fetch** | ✅ Yes | ❌ No | Low | ✅ **Working** |
| **GraphQL-SSE Client** | ✅ Yes | ❌ No | Low | ✅ **Working** |

## Apollo Client Integration

### ✅ **Status: Production Ready**

Apollo Client requires a custom link to handle SSE subscriptions. We provide a ready-to-use `GraphQLSSELink` with complete examples and demos.

#### Installation

```typescript
// Copy our custom link from examples/
import { createGraphQLSSELink } from './apollo-sse-link';
```

#### Live Demo

A complete, runnable Apollo Client demo is available in `examples/apollo-demo/`:

```bash
cd examples/apollo-demo
npm install
npm run dev
# Opens at http://localhost:3000
```

**Features:**
- ✅ Real Apollo Client with proper npm packages
- ✅ React + TypeScript with Vite build system  
- ✅ `useSubscription` hook works exactly like WebSocket subscriptions
- ✅ Modern UI with real-time stats and event history
- ✅ Production-ready patterns you can copy to your app

#### Setup

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { createGraphQLSSELink } from './apollo-sse-link';

// HTTP link for queries/mutations (to WPGraphQL)
const httpLink = new HttpLink({
  uri: 'https://your-site.com/graphql',
});

// SSE link for subscriptions (to SSE-2 sidecar)
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  credentials: 'include',
});

// Split traffic by operation type
const client = new ApolloClient({
  link: split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return definition.kind === 'OperationDefinition' && 
             definition.operation === 'subscription';
    },
    sseLink,    // Subscriptions → SSE-2
    httpLink    // Queries/Mutations → WPGraphQL
  ),
  cache: new InMemoryCache(),
});
```

#### Usage

```typescript
// Works exactly like normal Apollo subscriptions
const { data } = useSubscription(gql`
  subscription PostUpdated($id: ID!) {
    postUpdated(id: $id) {
      id
      title
      content
    }
  }
`, { variables: { id: '147' } });
```

#### Pros
- ✅ Full Apollo Client feature compatibility
- ✅ Works with React hooks (`useSubscription`)
- ✅ Automatic connection management
- ✅ Error handling and retry logic

#### Cons
- ❌ Requires custom link implementation
- ❌ Additional complexity in setup

## Urql Integration

### 🚧 **Status: Planned**

Urql can be extended with custom exchanges for SSE support.

#### Implementation Plan

```typescript
// Custom SSE exchange for Urql
import { Exchange } from 'urql';

const sseExchange: Exchange = ({ client, forward }) => {
  return operations$ => {
    // Implementation similar to Apollo Link
    // Handle subscription operations via SSE
  };
};

const client = createClient({
  url: 'https://your-site.com/graphql',
  exchanges: [
    dedupExchange,
    cacheExchange,
    sseExchange, // Custom SSE exchange
    fetchExchange,
  ],
});
```

## Relay Integration

### 🚧 **Status: Planned**

Relay requires a custom network layer for SSE subscriptions.

#### Implementation Plan

```typescript
// Custom Relay network layer
import { Network, Environment } from 'relay-runtime';

const network = Network.create(
  // Standard fetch for queries/mutations
  (operation, variables) => fetchGraphQL(operation, variables),
  
  // Custom SSE handler for subscriptions
  (operation, variables) => subscribeSSE(operation, variables)
);
```

## graphql-request Integration

### 🚧 **Status: Planned**

graphql-request can be extended with a custom subscription handler.

#### Implementation Plan

```typescript
import { GraphQLClient } from 'graphql-request';

// Extend GraphQLClient with SSE subscription support
class SSEGraphQLClient extends GraphQLClient {
  subscribe(query: string, variables?: any) {
    // Custom SSE subscription implementation
    return createSSESubscription(query, variables);
  }
}
```

## Vanilla Fetch/JavaScript

### ✅ **Status: Working**

Direct fetch API usage works perfectly with our SSE implementation.

#### Example

```javascript
async function subscribe(query, variables = {}) {
  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ query, variables }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        console.log('Received:', data);
      }
    }
  }
}

// Usage
subscribe(`
  subscription PostUpdated($id: ID!) {
    postUpdated(id: $id) {
      id
      title
      content
    }
  }
`, { id: '147' });
```

## GraphQL-SSE Client Library

### ✅ **Status: Working**

The official `graphql-sse` client library works directly with our implementation.

#### Installation

```bash
npm install graphql-sse
```

#### Usage

```typescript
import { createClient } from 'graphql-sse';

const client = createClient({
  url: 'http://localhost:4000/graphql',
});

const unsubscribe = client.subscribe(
  {
    query: 'subscription { postUpdated(id: "147") { id title } }',
  },
  {
    next: (data) => console.log('Received:', data),
    error: (err) => console.error('Error:', err),
    complete: () => console.log('Completed'),
  }
);

// Clean up
unsubscribe();
```

## React Integration Examples

### With Apollo Client

```tsx
import { useSubscription } from '@apollo/client';
import { gql } from '@apollo/client';

function PostUpdates({ postId }: { postId: string }) {
  const { data, loading, error } = useSubscription(
    gql`
      subscription PostUpdated($id: ID!) {
        postUpdated(id: $id) {
          id
          title
          content
          modified
        }
      }
    `,
    { variables: { id: postId } }
  );

  if (loading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>{data?.postUpdated?.title}</h2>
      <p>Last modified: {data?.postUpdated?.modified}</p>
      <div>{data?.postUpdated?.content}</div>
    </div>
  );
}
```

### With Custom Hook

```tsx
import { useEffect, useState } from 'react';

function useSSESubscription(query: string, variables: any = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let reader: ReadableStreamDefaultReader | null = null;
    let abortController = new AbortController();

    const subscribe = async () => {
      try {
        const response = await fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({ query, variables }),
          signal: abortController.signal,
        });

        reader = response.body!.getReader();
        const decoder = new TextDecoder();
        setLoading(false);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const eventData = JSON.parse(line.substring(6));
              if (eventData.errors) {
                setError(eventData.errors[0].message);
              } else {
                setData(eventData.data);
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    subscribe();

    return () => {
      abortController.abort();
      if (reader) {
        reader.cancel();
      }
    };
  }, [query, JSON.stringify(variables)]);

  return { data, error, loading };
}

// Usage
function PostUpdates({ postId }: { postId: string }) {
  const { data, loading, error } = useSSESubscription(`
    subscription PostUpdated($id: ID!) {
      postUpdated(id: $id) {
        id
        title
        content
      }
    }
  `, { id: postId });

  if (loading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>{data?.postUpdated?.title}</h2>
      <div>{data?.postUpdated?.content}</div>
    </div>
  );
}
```

## Authentication Handling

### Token-based Authentication

```typescript
// Apollo Client with auth
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
  },
});

// Vanilla fetch with auth
const response = await fetch('http://localhost:4000/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${getAuthToken()}`,
  },
  body: JSON.stringify({ query, variables }),
});
```

### Cookie-based Authentication

```typescript
// Enable credentials for cookie auth
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  credentials: 'include', // Sends cookies
});
```

## Error Handling

### Connection Errors

```typescript
// Handle connection failures
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  onError: (error) => {
    console.error('SSE connection error:', error);
    // Implement retry logic or user notification
  },
});
```

### Subscription Errors

```typescript
// Handle GraphQL errors in subscriptions
client.subscribe({
  query: SUBSCRIPTION,
  variables: { id: '147' },
}).subscribe({
  next: (result) => {
    if (result.errors) {
      console.error('Subscription errors:', result.errors);
    } else {
      console.log('Data:', result.data);
    }
  },
  error: (error) => {
    console.error('Network error:', error);
  },
});
```

## Performance Considerations

### Connection Limits

- **HTTP/1.1**: ~6 concurrent connections per domain
- **HTTP/2**: ~100+ concurrent streams
- **Recommendation**: Use HTTP/2 for production

### Memory Management

```typescript
// Always clean up subscriptions
const subscription = client.subscribe(/* ... */);

// Clean up when component unmounts
useEffect(() => {
  return () => subscription.unsubscribe();
}, []);
```

### Batching Considerations

SSE subscriptions are individual connections. For high-frequency updates, consider:

1. **Debouncing** on the client side
2. **Batching** multiple subscriptions where possible
3. **Connection pooling** strategies

## Migration Guide

### From WebSocket Subscriptions

1. **Replace WebSocket link** with SSE link
2. **Update endpoint** to point to SSE-2 sidecar
3. **Test connection management** (start/stop behavior)
4. **Verify authentication** flow works with SSE

### From Polling

1. **Replace polling queries** with subscriptions
2. **Update components** to use real-time data
3. **Remove polling intervals** and timers
4. **Test performance** improvements

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure SSE-2 sidecar has proper CORS headers
   - Check browser network tab for preflight requests

2. **Authentication Failures**
   - Verify tokens are passed correctly
   - Check cookie settings for cross-origin requests

3. **Connection Not Closing**
   - Ensure cleanup functions are called
   - Check browser network tab for connection status

4. **Performance Issues**
   - Monitor connection count
   - Implement proper cleanup in React components
   - Consider connection pooling for many subscriptions

### Debug Mode

```typescript
// Enable debug logging
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  debug: true, // Logs connection events
});
```

## Roadmap

### Short Term
- ✅ Apollo Client integration (complete)
- 🚧 Urql exchange implementation
- 🚧 React hooks library

### Medium Term
- 🚧 Relay network layer
- 🚧 Vue.js integration examples
- 🚧 Svelte integration examples

### Long Term
- 🚧 Official client library
- 🚧 Framework-agnostic adapters
- 🚧 Performance optimization tools

## Contributing

We welcome contributions for additional client integrations! See our [contribution guide](../CONTRIBUTING.md) for details.
