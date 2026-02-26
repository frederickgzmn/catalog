/**
 * Apollo Client configuration with SSE-2 integration
 */

import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { createGraphQLSSELink } from './apollo-sse-link';

// Create HTTP link for queries and mutations (to WPGraphQL)
const httpLink = new HttpLink({
  uri: 'http://your-wordpress-site.com/graphql', // Replace with your WPGraphQL endpoint
  credentials: 'include',
});

// Create SSE link for subscriptions (to SSE-2 sidecar)
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql', // SSE-2 sidecar endpoint
  credentials: 'include',
  headers: {
    // Add authentication headers if needed
    // 'Authorization': 'Bearer your-token-here',
  },
});

// Split traffic: subscriptions go to SSE, everything else to HTTP
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  sseLink,    // Subscriptions use SSE
  httpLink    // Queries/mutations use HTTP to WPGraphQL
);

// Create Apollo Client instance
export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
    },
    query: {
      errorPolicy: 'all',
    },
  },
});
