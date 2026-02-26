# Apollo Client + SSE-2 Demo

A complete, production-ready demo showing Apollo Client working seamlessly with our SSE-2 GraphQL subscription sidecar using Server-Sent Events.

## 🚀 Features

- ✅ **Real Apollo Client** with proper TypeScript integration
- ✅ **useSubscription hook** works exactly like WebSocket subscriptions
- ✅ **Custom GraphQL-SSE Link** handles Server-Sent Events
- ✅ **Split traffic** - subscriptions to SSE-2, queries to WPGraphQL
- ✅ **Real-time updates** with connection management
- ✅ **Event history** and statistics tracking
- ✅ **Responsive UI** with modern React patterns
- ✅ **Production patterns** you can copy to your app

## 🛠 Setup

### Prerequisites

1. **SSE-2 sidecar running:**
   ```bash
   cd ../..  # Go to sidecar/sse-2 root
   npm run dev
   ```

2. **Node.js 18+** installed

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The demo will open at `http://localhost:3000`

## 🎯 How to Use

1. **Start the demo** - `npm run dev`
2. **Configure Post ID** - Enter a WordPress post ID (default: 147)
3. **Click "Start Subscription"** - Connects to SSE-2 via Apollo Client
4. **Edit the post** in WordPress admin to see real-time updates
5. **Click "Stop Subscription"** - Cleanly closes the connection

## 🏗 Architecture

```
React App → Apollo Client → GraphQLSSELink → SSE-2 → Redis ← WordPress
     ↑                                                              
     └─── HttpLink ─────────────────────────→ WPGraphQL ←──────────┘
```

### Traffic Routing

- **Subscriptions** → `GraphQLSSELink` → SSE-2 sidecar (Server-Sent Events)
- **Queries/Mutations** → `HttpLink` → WPGraphQL (standard HTTP)

## 📁 Project Structure

```
apollo-demo/
├── src/
│   ├── apollo-client.ts      # Apollo Client configuration
│   ├── apollo-sse-link.ts    # Custom SSE Link implementation
│   ├── App.tsx               # Main React component
│   ├── App.css               # Styles
│   ├── main.tsx              # React entry point
│   └── index.css             # Global styles
├── package.json              # Dependencies
├── vite.config.ts            # Vite configuration
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

## 🔧 Key Files Explained

### `apollo-client.ts`

Sets up Apollo Client with traffic splitting:

```typescript
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return definition.kind === 'OperationDefinition' && 
           definition.operation === 'subscription';
  },
  sseLink,    // Subscriptions → SSE-2
  httpLink    // Queries/Mutations → WPGraphQL
);
```

### `apollo-sse-link.ts`

Custom Apollo Link that handles GraphQL-SSE protocol:

```typescript
export class GraphQLSSELink extends ApolloLink {
  request(operation) {
    return new Observable((observer) => {
      // Fetch with SSE headers
      // Parse Server-Sent Events
      // Handle connection lifecycle
    });
  }
}
```

### `App.tsx`

React component using standard Apollo hooks:

```typescript
const { data, loading, error } = useSubscription(POST_UPDATED_SUBSCRIPTION, {
  variables: { id: postId },
  skip: !isActive,
  onSubscriptionData: ({ subscriptionData }) => {
    // Handle real-time updates
  },
});
```

## 🧪 Testing

### 1. Basic Connection Test

1. Start the demo
2. Click "Start Subscription"
3. Verify status shows "Connected"
4. Check browser console for connection logs

### 2. Real-time Data Test

1. Start subscription for post ID 147
2. Edit post 147 in WordPress admin
3. Verify updates appear in the demo immediately
4. Check event history shows the updates

### 3. Connection Management Test

1. Start subscription
2. Click "Stop Subscription"
3. Verify connection closes cleanly
4. Check browser Network tab - no lingering requests

### 4. Error Handling Test

1. Stop SSE-2 sidecar
2. Try to start subscription
3. Verify proper error message appears
4. Restart sidecar and test reconnection

## 🔌 Integration Patterns

### Copy to Your App

1. **Copy the SSE Link:**
   ```typescript
   // Copy apollo-sse-link.ts to your project
   import { createGraphQLSSELink } from './apollo-sse-link';
   ```

2. **Set up Apollo Client:**
   ```typescript
   // Copy apollo-client.ts patterns
   const client = new ApolloClient({
     link: splitLink,
     cache: new InMemoryCache(),
   });
   ```

3. **Use in React:**
   ```typescript
   // Standard Apollo hooks work perfectly
   const { data } = useSubscription(YOUR_SUBSCRIPTION, {
     variables: { id: '123' },
   });
   ```

### Authentication

Add auth headers to the SSE link:

```typescript
const sseLink = createGraphQLSSELink({
  uri: 'http://localhost:4000/graphql',
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
  },
  credentials: 'include',
});
```

### Multiple Subscriptions

Each subscription gets its own SSE connection:

```typescript
// These run simultaneously with separate connections
const postsSubscription = useSubscription(POST_SUBSCRIPTION);
const commentsSubscription = useSubscription(COMMENT_SUBSCRIPTION);
```

## 🎨 Customization

### Change Subscription

Edit the GraphQL subscription in `App.tsx`:

```typescript
const COMMENT_SUBSCRIPTION = gql`
  subscription CommentAdded($nodeId: ID!) {
    commentAdded(nodeId: $nodeId) {
      id
      content
      author { node { name } }
    }
  }
`;
```

### Styling

- Edit `App.css` for component styles
- Edit `index.css` for global styles
- Uses CSS Grid and Flexbox for responsive design

### Add Features

The demo shows core patterns. You can extend it with:

- Multiple subscription types
- Real-time notifications
- Data persistence
- Advanced error handling
- Connection retry logic

## 📊 Performance

### Connection Limits

- **HTTP/1.1**: ~6 concurrent connections per domain
- **HTTP/2**: 100+ concurrent connections
- Each subscription = one SSE connection

### Memory Management

The demo properly cleans up subscriptions:

```typescript
useEffect(() => {
  // Subscription auto-cleanup on unmount
  return () => subscription?.unsubscribe();
}, []);
```

### Production Considerations

1. **Use HTTP/2** for multiple connections
2. **Implement connection pooling** for many subscriptions
3. **Add retry logic** for network failures
4. **Monitor connection count** in production

## 🐛 Troubleshooting

### "Connection failed"

- Verify SSE-2 sidecar is running on `http://localhost:4000`
- Check CORS settings in SSE-2 configuration
- Look at browser console for detailed errors

### "No data received"

- Confirm WordPress is sending webhook events to SSE-2
- Check SSE-2 logs for incoming events
- Verify Post ID exists and has correct permissions

### Build Issues

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run build
```

## 🚀 Deployment

### Build for Production

```bash
npm run build
```

### Deploy

The built files in `dist/` can be deployed to any static hosting:

- Vercel
- Netlify
- AWS S3 + CloudFront
- Your own server

### Environment Variables

For production, update endpoints in `apollo-client.ts`:

```typescript
const sseLink = createGraphQLSSELink({
  uri: process.env.VITE_SSE_ENDPOINT || 'http://localhost:4000/graphql',
});

const httpLink = new HttpLink({
  uri: process.env.VITE_GRAPHQL_ENDPOINT || 'https://your-site.com/graphql',
});
```

## ✨ What This Proves

This demo proves that:

1. ✅ **Apollo Client works perfectly** with SSE-2
2. ✅ **useSubscription hook** works exactly like WebSocket subscriptions  
3. ✅ **Connection management** works properly (no lingering connections)
4. ✅ **Real-time updates** flow seamlessly from WordPress to React
5. ✅ **Production patterns** are solid and ready to use

The SSE-2 + Apollo Client integration is **production-ready**! 🎉
