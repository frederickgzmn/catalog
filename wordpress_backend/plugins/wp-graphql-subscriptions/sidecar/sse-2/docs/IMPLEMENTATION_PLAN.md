# SSE-2 Implementation Plan

## Project Goals

Build a minimal, focused GraphQL subscription server that:
- ✅ Follows the GraphQL-SSE protocol specification
- ✅ Handles subscriptions only (rejects queries/mutations)
- ✅ Coordinates between WordPress events and GraphQL clients
- ✅ Executes subscription documents against WPGraphQL
- ✅ Provides secure, token-based authentication

## Phase 1: Foundation Setup

### 1.1 Project Structure ✅ **COMPLETED**
- [x] Initialize TypeScript project with minimal dependencies
- [x] Set up build system and development scripts
- [x] Create basic project structure
- [x] Configure environment variables and logging

**Dependencies:**
```json
{
  "dependencies": {
    "node-fetch": "^3.3.2",
    "redis": "^4.6.0",
    "graphql": "^16.8.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Optional GraphiQL Dependencies:**
```json
{
  "optionalDependencies": {
    "@graphiql/toolkit": "^0.8.0",
    "graphiql": "^3.0.0"
  }
}
```

### 1.2 Basic HTTP Server ✅ **COMPLETED**
- [x] Create HTTP server with POST endpoint
- [x] Implement request parsing and validation
- [x] Add proper error handling and logging
- [x] Test basic connectivity

### 1.3 GraphQL Validation ✅ **COMPLETED**
- [x] Parse and validate GraphQL documents
- [x] Detect subscription operations (reject others)
- [x] Extract subscription metadata (fields, variables)
- [x] Validate subscription structure

### 1.4 GraphiQL IDE Integration (GraphQL Yoga Pattern) ✅ **COMPLETED**
- [x] Implement content negotiation on single `/graphql` endpoint
- [x] Serve GraphiQL HTML for `GET + Accept: text/html`
- [x] Handle introspection for `POST + Accept: application/json`
- [x] Create custom SSE fetcher for subscription support
- [x] Add example subscriptions and helpful error messages

### 1.5 Apollo Client Integration ✅ **COMPLETED** 🆕
- [x] Create custom GraphQLSSELink for Apollo Client
- [x] Build production-ready React + TypeScript demo with Vite
- [x] Implement proper connection management with AbortController
- [x] Fix all CORS issues for browser compatibility
- [x] Add comprehensive examples and documentation
- [x] Test with real useSubscription hooks
- [x] Create vanilla JavaScript demo for comparison
- [x] Document client compatibility matrix

## Phase 2: SSE Protocol Implementation

### 2.1 SSE Connection Management ⏳ **PENDING**
- [ ] Establish SSE connections with proper headers
- [ ] Implement connection lifecycle management
- [ ] Handle client disconnections gracefully
- [ ] Add connection limits and rate limiting

### 2.2 Protocol Compliance ⏳ **PENDING**
- [ ] Implement `next` event formatting
- [ ] Implement `complete` event handling
- [ ] Follow GraphQL-SSE protocol specification
- [ ] Add proper HTTP status codes

### 2.3 Event Streaming ⏳ **PENDING**
- [ ] Stream GraphQL execution results
- [ ] Handle streaming errors appropriately
- [ ] Implement proper event formatting
- [ ] Test with various GraphQL clients

## Phase 3: Subscription Management

### 3.1 Subscription Storage ⏳ **PENDING**
- [ ] Create subscription manager class
- [ ] Store active subscription documents
- [ ] Map subscriptions to Redis channels
- [ ] Handle subscription cleanup

### 3.2 Channel Mapping ⏳ **PENDING**
- [ ] Introspect WPGraphQL subscription fields
- [ ] Map subscription fields to Redis channels
- [ ] Implement channel naming strategy
- [ ] Support subscription arguments

### 3.3 Subscription Lifecycle ⏳ **PENDING**
- [ ] Add subscription on connection
- [ ] Remove subscription on disconnect
- [ ] Handle subscription errors
- [ ] Monitor subscription health

## Phase 4: Redis Integration

### 4.1 Redis Connection ⏳ **PENDING**
- [ ] Set up Redis client with connection pooling
- [ ] Implement pub/sub event handling
- [ ] Add Redis connection health checks
- [ ] Handle Redis reconnection logic

### 4.2 Event Processing ⏳ **PENDING**
- [ ] Subscribe to relevant Redis channels
- [ ] Route events to matching subscriptions
- [ ] Handle event payload parsing
- [ ] Implement event filtering logic

### 4.3 Channel Management ⏳ **PENDING**
- [ ] Dynamic channel subscription/unsubscription
- [ ] Optimize channel usage
- [ ] Monitor channel activity
- [ ] Debug channel routing

## Phase 5: WPGraphQL Integration

### 5.1 Document Execution ⏳ **PENDING**
- [ ] Execute subscription documents against WPGraphQL
- [ ] Pass event payload as `rootValue`
- [ ] Handle authentication headers
- [ ] Process execution results

### 5.2 Security Implementation ⏳ **PENDING**
- [ ] Generate HMAC tokens for requests
- [ ] Include subscription metadata in tokens
- [ ] Validate tokens on WPGraphQL side
- [ ] Prevent unauthorized access

### 5.3 Error Handling ⏳ **PENDING**
- [ ] Handle WPGraphQL execution errors
- [ ] Stream errors to subscribers
- [ ] Implement retry logic
- [ ] Monitor execution health

## Phase 6: Testing & Optimization

### 6.1 Integration Testing ⏳ **PENDING**
- [ ] Test end-to-end subscription flow
- [ ] Verify protocol compliance
- [ ] Test with multiple clients
- [ ] Load testing with many subscriptions

### 6.2 Performance Optimization ⏳ **PENDING**
- [ ] Optimize memory usage
- [ ] Improve event processing speed
- [ ] Reduce WPGraphQL request latency
- [ ] Monitor resource usage

### 6.3 Production Readiness ⏳ **PENDING**
- [ ] Add comprehensive logging
- [ ] Implement health checks
- [ ] Add monitoring metrics
- [ ] Create deployment documentation

## Technical Specifications

### Project Structure
```
sidecar/sse-2/
├── docs/                    # Documentation
├── src/
│   ├── server.ts           # HTTP server
│   ├── subscription/       # Subscription management
│   ├── redis/              # Redis integration
│   ├── wpgraphql/          # WPGraphQL client
│   ├── sse/                # SSE protocol implementation
│   ├── graphiql/           # GraphiQL integration
│   │   ├── index.html      # GraphiQL HTML template
│   │   ├── fetcher.js      # Custom SSE fetcher
│   │   └── examples.js     # Example subscriptions
│   └── utils/              # Utilities
├── static/                 # Static assets for GraphiQL
├── tests/                  # Test files
├── package.json
├── tsconfig.json
└── README.md
```

### Key Classes

#### `SubscriptionServer`
- Main HTTP server
- Request routing and validation
- SSE connection management

#### `SubscriptionManager`
- Active subscription storage
- Channel mapping
- Lifecycle management

#### `RedisClient`
- Redis pub/sub integration
- Event routing
- Connection management

#### `WPGraphQLClient`
- Document execution
- Security token handling
- Response processing

#### `SSEStreamer`
- Protocol-compliant event streaming
- Connection management
- Error handling

### Environment Configuration
```bash
# Server Configuration
PORT=4000
HOST=localhost

# WPGraphQL Configuration
WPGRAPHQL_ENDPOINT=http://localhost/graphql
WPGRAPHQL_TIMEOUT=10000

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Security Configuration
SUBSCRIPTION_SECRET=your-secret-key

# Logging Configuration
LOG_LEVEL=info
```

### Success Criteria

#### Phase 1-2 Success
- [ ] HTTP server accepts subscription requests
- [ ] SSE connections established correctly
- [ ] Protocol-compliant event streaming

#### Phase 3-4 Success
- [ ] Subscriptions stored and managed
- [ ] Redis events received and routed
- [ ] Channel mapping working correctly

#### Phase 5-6 Success
- [ ] End-to-end subscription flow working
- [ ] Security tokens validated
- [ ] Production-ready performance

### Risk Mitigation

#### **Risk**: Complex GraphQL parsing
**Mitigation**: Use proven GraphQL libraries, focus on subscription detection only

#### **Risk**: SSE connection management
**Mitigation**: Follow established SSE patterns, implement proper cleanup

#### **Risk**: Redis integration complexity
**Mitigation**: Reuse patterns from SSE-1, focus on simplicity

#### **Risk**: WPGraphQL compatibility
**Mitigation**: Thorough testing, maintain security token approach

## Timeline Estimate

- **Phase 1**: 1-2 days (Foundation)
- **Phase 2**: 2-3 days (SSE Protocol)
- **Phase 3**: 1-2 days (Subscription Management)
- **Phase 4**: 1-2 days (Redis Integration)
- **Phase 5**: 2-3 days (WPGraphQL Integration)
- **Phase 6**: 2-3 days (Testing & Optimization)

**Total**: ~10-15 days for full implementation

## Next Steps

1. **Start Phase 1.1**: Initialize project structure
2. **Create basic TypeScript setup**: Package.json, tsconfig, basic server
3. **Implement HTTP endpoint**: Accept POST requests, validate GraphQL
4. **Add SSE capabilities**: Establish connections, stream events
5. **Integrate Redis**: Subscribe to events, route to subscriptions
