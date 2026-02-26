# SSE-2 Examples

This directory contains executable examples showing how to integrate with our SSE-2 GraphQL subscription sidecar.

## 🚀 Apollo Client Demos

### `apollo-demo/` (Recommended)

A complete **React + TypeScript** demo with proper build tooling showing Apollo Client working with SSE-2 subscriptions.

**Features:**
- ✅ **Real Apollo Client** with proper npm packages (no CDN issues)
- ✅ **React + TypeScript** with Vite build system
- ✅ **useSubscription hook** works exactly like WebSocket subscriptions
- ✅ **Production-ready patterns** you can copy to your app
- ✅ **Modern UI** with real-time stats and event history

**How to run:**
```bash
cd apollo-demo
npm install
npm run dev
```
Opens at `http://localhost:3000` with full Apollo Client integration!

### `apollo-demo.html` (Fallback)

A single-file HTML demo (has CDN loading issues, use the React demo above instead).

**Features:**
- ✅ **Live Apollo Client integration** using our custom GraphQL-SSE Link
- ✅ **Real-time connection status** and event logging
- ✅ **Interactive controls** to start/stop subscriptions
- ✅ **Statistics tracking** (events received, connection time, etc.)
- ✅ **Pretty-printed data display** showing live subscription results
- ✅ **No build step required** - opens directly in browser

### How to Run

1. **Start your SSE-2 sidecar:**
   ```bash
   cd sidecar/sse-2
   npm run dev
   ```

2. **Open the demo:**
   ```bash
   # Simply open in your browser
   open examples/apollo-demo.html
   # Or navigate to the file in your browser
   ```

3. **Test the integration:**
   - Configure the SSE-2 endpoint (default: `http://localhost:4000/graphql`)
   - Set a Post ID to subscribe to (default: `147`)
   - Click "Connect & Subscribe"
   - Watch real-time events in the log and data display

4. **Trigger events** (to see subscription data):
   - Edit post 147 in your WordPress admin
   - Or use the webhook test endpoint to simulate events

### What You'll See

**Connection Flow:**
1. Apollo Client initializes with custom SSE Link
2. Subscription request sent to SSE-2 sidecar
3. SSE connection established
4. Real-time events streamed and displayed
5. Clean disconnection when "Stop" is clicked

**Live Data:**
- Connection status (connecting → connected → disconnected)
- Real-time event log with timestamps
- Latest subscription data (pretty-printed JSON)
- Statistics (events received, connection duration)

### Browser Compatibility

- ✅ **Chrome/Edge** - Full support
- ✅ **Firefox** - Full support  
- ✅ **Safari** - Full support
- ✅ **Mobile browsers** - Full support
- ✅ **Incognito/Private mode** - Full support (thanks to our connection fixes!)

## 📋 Other Examples

### `apollo-client-integration.ts`

TypeScript code example showing how to integrate the SSE Link into a real application:

- Production-ready Apollo Client setup
- Proper TypeScript types
- React hooks usage examples
- Error handling patterns

### Usage in Your App

```typescript
// Copy the GraphQLSSELink class from apollo-demo.html or apollo-sse-link.ts
import { createGraphQLSSELink } from '../src/apollo-sse-link';

// Set up Apollo Client exactly like the demo
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

## 🧪 Testing Scenarios

### 1. Basic Subscription Test
- Start demo, connect to subscription
- Verify connection status shows "Connected"
- Check event log for successful connection

### 2. Data Flow Test  
- Edit a WordPress post while subscription is active
- Verify data appears in the "Latest Subscription Data" section
- Check event log for data reception events

### 3. Connection Management Test
- Connect to subscription
- Click "Disconnect" 
- Verify connection closes cleanly (no lingering network requests)
- Check browser Network tab for proper connection termination

### 4. Error Handling Test
- Try connecting with SSE-2 sidecar stopped
- Verify proper error messages appear
- Test reconnection after starting sidecar

### 5. Multiple Subscriptions Test
- Open multiple browser tabs with the demo
- Connect different Post IDs in each tab
- Verify each gets appropriate data

## 🔧 Customization

### Change Subscription Type

Edit the subscription in `apollo-demo.html`:

```javascript
const subscription = window.apolloClient.gql`
    subscription CommentAdded($nodeId: ID!) {
        commentAdded(nodeId: $nodeId) {
            id
            content
            date
            author {
                node {
                    name
                }
            }
        }
    }
`;
```

### Add Authentication

Add headers to the SSE Link:

```javascript
const sseLink = new GraphQLSSELink({
    uri: sseEndpoint,
    headers: {
        'Authorization': 'Bearer your-token-here',
    },
});
```

### Custom Styling

The demo uses inline CSS for portability. Customize the styles in the `<style>` section to match your brand.

## 📊 Performance Notes

### Connection Limits
- **HTTP/1.1**: ~6 concurrent connections per domain
- **HTTP/2**: 100+ concurrent connections
- **Recommendation**: Use HTTP/2 in production

### Memory Management
The demo properly cleans up subscriptions and connections. In production:

```javascript
// Always clean up subscriptions
useEffect(() => {
  const subscription = client.subscribe(/* ... */);
  return () => subscription.unsubscribe();
}, []);
```

## 🐛 Troubleshooting

### "Failed to fetch" Error
- Check that SSE-2 sidecar is running on `http://localhost:4000`
- Verify CORS settings allow browser connections
- Check browser console for detailed error messages

### No Data Received
- Verify WordPress is sending webhook events to SSE-2
- Check SSE-2 logs for incoming webhook events
- Confirm Post ID exists and has the right permissions

### Connection Won't Close
- This should be fixed with our connection management improvements
- Check browser Network tab - connection should show as "finished" when stopped
- Try refreshing the page if connection seems stuck

## 🚀 Next Steps

After testing the demo:

1. **Integrate into your app** using the patterns shown
2. **Customize subscriptions** for your specific use cases  
3. **Add authentication** if needed
4. **Deploy to production** with proper CORS and security settings

The demo proves that Apollo Client works seamlessly with our SSE-2 implementation!
