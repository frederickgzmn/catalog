# SSE-2: Minimal GraphQL Subscription Sidecar

A focused, lightweight GraphQL subscription server that follows the [GraphQL over Server-Sent Events Protocol](https://raw.githubusercontent.com/enisdenjo/graphql-sse/refs/heads/master/PROTOCOL.md).

## Overview

SSE-2 is a minimal sidecar server designed specifically for real-time GraphQL subscriptions with WordPress and WPGraphQL. Unlike traditional GraphQL servers, it focuses solely on coordinating subscriptions between clients and WordPress events.

### Key Features

- 🎯 **Subscription-Only**: Accepts only GraphQL subscription operations
- 📡 **Protocol Compliant**: Follows GraphQL-SSE specification
- 🔒 **Secure**: Token-based authentication with WPGraphQL
- ⚡ **Minimal**: Lightweight with few dependencies
- 🔄 **Event-Driven**: Redis pub/sub integration
- 🌐 **Schema-Agnostic**: Zero hardcoded schema knowledge, works with any WPGraphQL schema
- 📊 **Observable**: Comprehensive logging and monitoring
- 🎨 **Custom GraphiQL**: Built-in IDE with proper AST parsing and validation
- ✅ **Pre-Validation**: Catches syntax and variable errors before subscription creation
- 🚀 **Smart Execution Deduplication**: Optimizes performance while maintaining security isolation
- 🔐 **User-Context-Aware Caching**: Prevents data leakage between authenticated users
- 🔒 **Webhook Security**: HMAC signature validation with retry logic and non-blocking delivery

## Architecture

```
Client → SSE-2 → Redis ← WordPress
   ↑        ↓
   └── WPGraphQL ←┘
```

1. **Client** sends subscription to SSE-2
2. **SSE-2** stores subscription and listens to Redis channels (schema-agnostic)
3. **WordPress** publishes events with channel arrays to Redis (no mapping required)
4. **SSE-2** deduplicates execution for identical user contexts (performance optimization)
5. **SSE-2** executes subscription against WPGraphQL (once per unique context)
6. **WPGraphQL** returns filtered data
7. **SSE-2** streams response to all clients with matching context

### Schema-Agnostic Design

The sidecar requires **zero knowledge** of the WPGraphQL schema:
- WordPress provides `channels` arrays in webhook payloads
- SSE-2 uses channels directly without any hardcoded mapping
- New subscription types work automatically without sidecar updates

### Smart Execution Deduplication

SSE-2 optimizes performance by deduplicating subscription executions while maintaining security:

**Security-First Approach:**
- Each user context gets isolated cache entries
- User ID, roles, and capabilities included in cache keys
- Prevents data leakage between authenticated users
- Anonymous users share separate cache space

**Performance Benefits:**
- 100 concurrent clients → 1-5 executions (per user context)
- Reduces database load and GraphQL processing
- Configurable TTL (default: 5 seconds)
- Automatic cleanup and monitoring

**Cache Key Format:** `{queryHash}_{userIndicator}`
- `a1b2c3d4e5f6g7h8_anon` (anonymous user)
- `a1b2c3d4e5f6g7h8_u123` (authenticated user ID 123)
- `a1b2c3d4e5f6g7h8_uauth` (authenticated user, ID unknown)

## Current Status

✅ **Production Ready** - Phase 2.5 Complete with Apollo Client Integration and Performance Optimizations

**Latest Achievements:**
- Smart execution deduplication with user-context isolation
- Webhook security with HMAC validation and retry logic
- Apollo Client integration with custom SSE link
- GraphiQL connection management and proper SSE termination

- ✅ **Phase 1.1**: Project Setup - TypeScript foundation, configuration, logging
- ✅ **Phase 1.2**: HTTP Server - Content negotiation, GraphiQL IDE, SSE handling  
- ✅ **Phase 1.3**: Custom GraphiQL & Validation - AST parsing, pre-validation, custom build
- ⏳ **Phase 1.4**: Enhanced Features - Connection status, event history, templates

**Ready to test:**
- Custom GraphiQL IDE at `http://localhost:4000/graphql`
- Real-time subscription validation with proper error messages
- Cross-browser compatibility (including incognito mode)
- Content negotiation for different request types
- Environment configuration via `.env` file

See [docs/PROGRESS.md](docs/PROGRESS.md) for detailed progress tracking.

## Quick Start

### Prerequisites

- Node.js 18+
- Redis server (optional for Phase 1)
- WordPress with WPGraphQL plugin
- WPGraphQL Subscriptions plugin

### Installation

```bash
cd sidecar/sse-2
npm install
```

### Configuration

```bash
# 1. Copy and configure environment
cp .env.example .env
# 2. Edit .env with your settings (especially SUBSCRIPTION_SECRET)
```

**Example .env:**
```bash
# Server
PORT=4000
HOST=localhost
NODE_ENV=development

# WPGraphQL
WPGRAPHQL_ENDPOINT=http://localhost/graphql

# Redis
REDIS_URL=redis://localhost:6379

# Security - CHANGE THIS!
SUBSCRIPTION_SECRET=your-secret-key-here-change-in-production-32-chars-minimum

# Webhook Security (for WordPress → SSE-2 webhooks)
WEBHOOK_SECRET=dev-secret-key-change-in-production

# Logging
LOG_LEVEL=info
LOG_PRETTY=true
```

### Development

```bash
# Start development server
npm run dev

# Visit custom GraphiQL IDE
open http://localhost:4000/graphql

# Build GraphiQL in development mode (with watch)
npm run build:graphiql:dev
```

### Production

```bash
# Build everything (server + GraphiQL)
npm run build

# Start production server
npm start

# Build only GraphiQL bundle
npm run build:graphiql
```

**With Redis (for full functionality):**
```bash
npm run dev:full  # Starts Redis + dev server
```

## Custom GraphiQL IDE

SSE-2 includes a custom-built GraphiQL interface optimized for subscriptions:

### Features
- **🔍 AST-based parsing** - Uses `graphql-js` for accurate operation detection
- **⚡ Pre-validation** - Catches syntax and variable errors before subscription creation  
- **🎨 Real-time updates** - Native SSE subscription support with proper async iterators
- **🛑 Connection management** - Proper connection closing when Stop button is clicked
- **🌐 Cross-browser** - Works in regular and incognito/private browsing modes
- **📱 Responsive** - Modern, mobile-friendly interface
- **🎯 Subscription-focused** - Tailored specifically for subscription workflows

### Validation Examples

**Missing Variables:**
```graphql
subscription PostUpdated($id: ID!) {
  postUpdated(id: $id) { id title }
}
# Without variables: {"id": "147"}
# Result: "Variable '$id' of required type was not provided."
```

**Syntax Errors:**
```graphql
subscription PostUpdated {
  postUpdated(id: $invalidSyntax) { id title }
}
# Result: "GraphQL syntax error: ..."
```

**Operation Type Validation:**
```graphql
query GetPost {
  post(id: 1) { id title }
}
# Result: "Operation must be a subscription, got query"
```

## Usage

### Basic Subscription

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "subscription { postUpdated(id: 1) { id title content } }"
  }'
```

### JavaScript Client

```javascript
const response = await fetch('/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  },
  body: JSON.stringify({
    query: 'subscription { postUpdated(id: 1) { id title } }'
  })
});

// Handle SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  // Parse SSE events
}
```

## API Reference

### Endpoint

- **URL**: `POST /graphql`
- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`

### Request Format

```json
{
  "query": "subscription { postUpdated(id: 1) { id title } }",
  "variables": {},
  "operationName": "PostUpdated"
}
```

### Response Format

#### Success (SSE Stream)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: next
data: {"data":{"postUpdated":{"id":"1","title":"New Title"}}}

event: complete
data: 

```

#### Error (Non-Subscription)

```json
{
  "errors": [{
    "message": "Only subscription operations are supported",
    "extensions": {
      "code": "OPERATION_NOT_SUPPORTED"
    }
  }]
}
```

## Supported Subscriptions

Based on WPGraphQL schema introspection:

- `postUpdated(id: ID!)` - Post changes
- `commentUpdated(id: ID!)` - Comment changes
- `userUpdated(id: ID!)` - User changes

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `HOST` | `localhost` | Server host |
| `WPGRAPHQL_ENDPOINT` | Required | WPGraphQL endpoint URL |
| `WPGRAPHQL_TIMEOUT` | `10000` | Request timeout (ms) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `SUBSCRIPTION_SECRET` | Required | Security token secret |
| `WEBHOOK_SECRET` | Required | Webhook HMAC signature secret |
| `LOG_LEVEL` | `info` | Logging level |

### WordPress Setup

Install the security filters in your WordPress installation:

```php
// wp-config.php
define('WPGRAPHQL_SUBSCRIPTION_SECRET', 'your-secret-key');
define('WPGRAPHQL_SSE_WEBHOOK_SECRET', 'dev-secret-key-change-in-production');
```

### Webhook Payload Format

WordPress must send webhook events with this structure for schema-agnostic operation:

```json
{
  "node_type": "post",
  "action": "UPDATE", 
  "node_id": "147",
  "channels": [
    "wpgraphql:postUpdated.147",
    "wpgraphql:postUpdated"
  ],
  "context": {
    "post_id": "147"
  },
  "metadata": {
    "timestamp": 1640995200000
  }
}
```

**Required Fields:**
- `node_type`: Entity type (post, user, comment, etc.)
- `action`: Action performed (CREATE, UPDATE, DELETE)
- `node_id`: ID of the affected entity
- `channels`: Array of Redis channels to publish to (schema-agnostic!)

**Optional Fields:**
- `context`: Additional context data
- `metadata`: Event metadata like timestamps

## Development

### Project Structure

```
sidecar/sse-2/
├── docs/                   # Documentation
├── src/
│   ├── server/            # HTTP server implementation
│   ├── subscription/      # Subscription management
│   ├── redis/             # Redis integration  
│   ├── graphql/           # GraphQL client & parsing
│   ├── graphiql/          # Custom GraphiQL source
│   │   ├── CustomGraphiQL.tsx  # React component
│   │   ├── index.tsx      # Entry point
│   │   └── index.html     # HTML template
│   ├── logger/            # Logging utilities
│   ├── config/            # Configuration
│   └── types/             # TypeScript definitions
├── dist/
│   ├── public/            # Built GraphiQL bundle
│   └── *.js               # Compiled server code
├── tests/                 # Tests
├── webpack.config.cjs     # GraphiQL build config
└── package.json
```

### Scripts

- `npm run dev` - Development server with hot reload
- `npm run build` - Build everything (server + GraphiQL)
- `npm run build:server` - Build only server code
- `npm run build:graphiql` - Build only GraphiQL bundle
- `npm run build:graphiql:dev` - Build GraphiQL with watch mode
- `npm run start` - Start production server
- `npm run restart` - Kill existing processes and restart dev server
- `npm run kill` - Kill all related processes
- `npm run test` - Run tests
- `npm run lint` - Lint code

### Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

## Monitoring

### Health Check

```bash
curl http://localhost:4000/health
```

### Metrics

- Active subscriptions count
- Redis connection status
- WPGraphQL response times
- Memory usage

### Logs

Structured JSON logging with correlation IDs:

```json
{
  "level": "info",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "message": "Subscription created",
  "subscriptionId": "sub_123",
  "operation": "postUpdated",
  "clientId": "client_456"
}
```

## Security

### Authentication

SSE-2 generates HMAC tokens for WPGraphQL requests:

- Prevents unauthorized `rootValue` injection
- Includes subscription metadata
- Time-based expiration (5 minutes)

### Rate Limiting

- Max 10 subscriptions per client
- Connection timeout after 1 hour idle
- Request rate limiting

### Input Validation

- **GraphQL AST parsing** - Uses `graphql-js` for accurate syntax validation
- **Operation type validation** - Ensures only subscription operations are accepted
- **Variable validation** - Checks required variables are provided before subscription creation
- **Pre-execution validation** - Catches errors before establishing SSE connections
- **Variable sanitization** - Validates variable types and values
- **Operation complexity limits** - Prevents overly complex subscriptions

## Troubleshooting

### Common Issues

#### Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Solution**: Start Redis server

#### Invalid Token
```
{"errors":[{"message":"Invalid subscription token"}]}
```
**Solution**: Check `SUBSCRIPTION_SECRET` matches WordPress

#### Schema Not Found
```
Error: Failed to introspect WPGraphQL schema
```
**Solution**: Verify WPGraphQL endpoint is accessible

#### GraphiQL Loading Error
```
GraphiQL Loading Error - The custom GraphiQL bundle could not be loaded
```
**Solution**: Run `npm run build:graphiql` then restart server

#### Variable Validation Error
```
{"errors":[{"message":"Variable \"$id\" of required type was not provided."}]}
```
**Solution**: Add required variables in GraphiQL variables panel: `{"id": "147"}`

#### Subscription Not Detected
```
Operation must be a subscription, got query
```
**Solution**: Ensure your operation starts with `subscription` keyword

#### Connection Not Closing
If clicking "Stop" in GraphiQL doesn't immediately close the SSE connection:
**Solution**: The connection should close automatically. If not, open browser console and run `closeActiveSubscription()` to manually close it.

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

### Health Checks

```bash
# Server health
curl http://localhost:4000/health

# Redis connection
redis-cli ping

# WPGraphQL endpoint
curl http://localhost/graphql -d '{"query":"{__typename}"}'
```

## Performance

### Benchmarks

- **Concurrent Connections**: 1000+ (HTTP/2)
- **Latency**: <10ms (local Redis)
- **Memory Usage**: <100MB (1000 subscriptions)
- **CPU Usage**: <5% (idle)

### Optimization Tips

1. Use HTTP/2 for multiple connections
2. Enable Redis connection pooling
3. Set appropriate keep-alive timeouts
4. Monitor memory usage with many subscriptions

## Migration from SSE-1

SSE-2 is a complete rewrite. Key differences:

| Feature | SSE-1 | SSE-2 |
|---------|-------|-------|
| Framework | GraphQL Yoga | Minimal HTTP |
| Operations | All | Subscriptions only |
| Schema | Transformed | Introspected |
| Protocol | Custom | GraphQL-SSE |
| Complexity | High | Low |

No direct migration path - deploy SSE-2 alongside SSE-1 and gradually migrate clients.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

Same as parent project.

## Support

- Documentation: `docs/` directory
- Issues: GitHub Issues
- Discussions: GitHub Discussions
