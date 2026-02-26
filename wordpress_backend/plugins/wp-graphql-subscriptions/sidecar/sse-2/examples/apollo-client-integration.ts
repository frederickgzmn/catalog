/**
 * Example: Integrating SSE-2 with Apollo Client
 * Shows how to use the custom GraphQL-SSE Link with Apollo Client
 */

import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { createGraphQLSSELink } from '../src/apollo-sse-link.js';
import { gql } from '@apollo/client';

// Create HTTP link for queries and mutations
const httpLink = new HttpLink({
  uri: 'http://your-wordpress-site.com/graphql', // Your WPGraphQL endpoint
  credentials: 'include', // Include cookies for authentication
});

// Create SSE link for subscriptions
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql', // SSE-2 sidecar endpoint
  credentials: 'include',
  headers: {
    // Include authentication headers if needed
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
const client = new ApolloClient({
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

// Example usage in a React component
export function ExampleUsage() {
  // Regular query - goes to WPGraphQL via HTTP
  const GET_POST = gql`
    query GetPost($id: ID!) {
      post(id: $id) {
        id
        title
        content
        modified
      }
    }
  `;

  // Subscription - goes to SSE-2 via Server-Sent Events
  const POST_UPDATED_SUBSCRIPTION = gql`
    subscription PostUpdated($id: ID!) {
      postUpdated(id: $id) {
        id
        title
        content
        modified
        author {
          node {
            name
          }
        }
      }
    }
  `;

  // Usage example (pseudo-code for React)
  /*
  const { data: postData } = useQuery(GET_POST, { 
    variables: { id: '147' } 
  });

  const { data: subscriptionData } = useSubscription(POST_UPDATED_SUBSCRIPTION, {
    variables: { id: '147' },
    onSubscriptionData: ({ subscriptionData }) => {
      console.log('Post updated:', subscriptionData.data?.postUpdated);
    },
  });
  */
}

// Alternative: Manual subscription handling
export async function manualSubscriptionExample() {
  const SUBSCRIPTION = gql`
    subscription PostUpdated($id: ID!) {
      postUpdated(id: $id) {
        id
        title
        modified
      }
    }
  `;

  // Subscribe manually using Apollo Client
  const observable = client.subscribe({
    query: SUBSCRIPTION,
    variables: { id: '147' },
  });

  const subscription = observable.subscribe({
    next: (result) => {
      console.log('Received update:', result.data?.postUpdated);
    },
    error: (error) => {
      console.error('Subscription error:', error);
    },
    complete: () => {
      console.log('Subscription completed');
    },
  });

  // Clean up subscription after 30 seconds
  setTimeout(() => {
    subscription.unsubscribe();
    console.log('Subscription cancelled');
  }, 30000);
}

export default client;
