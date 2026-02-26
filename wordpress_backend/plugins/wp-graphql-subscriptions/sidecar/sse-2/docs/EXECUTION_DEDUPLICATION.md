# Subscription Execution Deduplication

## Overview

The SSE-2 subscription system implements **execution deduplication** to optimize performance when multiple clients subscribe to identical or similar subscriptions. This prevents redundant GraphQL executions while maintaining strict security isolation between users.

## How It Works

### Without Deduplication (Current Problem)
```
Post Update Event
├── Client A (User 1): Execute GraphQL → postUpdated(id: "123") 
├── Client B (User 1): Execute GraphQL → postUpdated(id: "123") [DUPLICATE]
├── Client C (User 2): Execute GraphQL → postUpdated(id: "123") 
└── Client D (Anonymous): Execute GraphQL → postUpdated(id: "123")
```
**Result**: 4 identical GraphQL executions, 3 of which are wasteful.

### With Smart Deduplication (New Solution)
```
Post Update Event
├── Users with same context: Execute GraphQL ONCE → Distribute to multiple clients
├── User 1 Clients (A & B): Share cached result ✅
├── User 2 Client (C): Separate execution (different user context) ✅  
└── Anonymous Client (D): Separate execution (different auth context) ✅
```
**Result**: 3 executions (optimal), proper security isolation.

## Security-First Cache Key Strategy

### Cache Key Components
```typescript
cacheKey = hash(query + variables + userContext) + "_" + userIndicator
```

### User Context Normalization
```typescript
userContext = {
  userId: 123,
  userRoles: ["subscriber", "customer"],  // sorted for consistency
  capabilities: ["read", "edit_posts"],   // sorted for consistency  
  isAuthenticated: true
}
```

### Example Cache Keys
```
// Anonymous users
a1b2c3d4e5f6g7h8_anon

// Authenticated user ID 123
a1b2c3d4e5f6g7h8_u123  

// Authenticated user (ID unknown)
a1b2c3d4e5f6g7h8_uauth

// Different user with same query
a1b2c3d4e5f6g7h8_u456  // Different cache entry!
```

## Real-World Scenarios

### Scenario 1: Public Post Updates
```graphql
subscription PublicPost {
  postUpdated(id: "123") {
    id
    title
    content
    datePublished
  }
}
```

**Deduplication**: ✅ **Safe** - All users see identical public data
- Anonymous users share cache: `abc123_anon`
- Authenticated users share cache: `abc123_uauth` 

### Scenario 2: User-Specific Private Data
```graphql
subscription UserPosts {
  postUpdated(id: "123") {
    id
    title
    content
    author {
      email  # Private field!
    }
    isDraft  # User-specific visibility!
  }
}
```

**Deduplication**: ✅ **Safe with isolation** - Different cache per user
- User 1: `def456_u1` (sees email if authorized)
- User 2: `def456_u2` (may not see email)
- Anonymous: `def456_anon` (restricted view)

### Scenario 3: Role-Based Content
```graphql
subscription AdminPosts {
  postUpdated(id: "123") {
    id
    title
    adminNotes     # Admin-only field
    moderationStatus  # Admin-only field
  }
}
```

**Deduplication**: ✅ **Safe with role isolation**
- Admin users: `ghi789_uadmin` (full access)
- Regular users: `ghi789_uregular` (restricted)
- Anonymous: `ghi789_anon` (minimal access)

## Performance Benefits

### Execution Storm Prevention
**Before**: 100 concurrent clients = 100 GraphQL executions
**After**: 100 concurrent clients = 1-5 executions (depending on user contexts)

### Database Load Reduction
```sql
-- Before: Multiple identical queries
SELECT * FROM posts WHERE id = 123; -- Client A
SELECT * FROM posts WHERE id = 123; -- Client B  
SELECT * FROM posts WHERE id = 123; -- Client C

-- After: Single query, multiple distributions
SELECT * FROM posts WHERE id = 123; -- Cached result shared
```

### Memory Efficiency
- **Cache TTL**: 5 seconds (configurable)
- **Automatic cleanup**: Expired entries removed every 30 seconds
- **Memory usage**: ~1KB per cached result

## Cache Statistics & Monitoring

### Performance Metrics
```typescript
const stats = executionCache.getStats();
// {
//   cacheSize: 45,
//   pendingExecutions: 3,
//   userContextBreakdown: {
//     authenticated: 32,
//     anonymous: 13,
//     uniqueUsers: 8
//   }
// }
```

### Security Audit
```typescript
const audit = executionCache.securityAudit();
// {
//   warnings: [
//     "Found 12 queries cached for multiple user contexts"
//   ],
//   recommendations: [
//     "Verify that user-specific data is properly isolated"
//   ]
// }
```

## Configuration Options

### Cache TTL (Time To Live)
```typescript
// Short TTL for real-time accuracy
const cache = new SubscriptionExecutionCache(2000, logger); // 2 seconds

// Longer TTL for performance
const cache = new SubscriptionExecutionCache(10000, logger); // 10 seconds
```

### User Context Extraction
```typescript
// From HTTP headers
const userContext = {
  userId: req.headers['x-user-id'],
  userRoles: JSON.parse(req.headers['x-user-roles'] || '[]'),
  capabilities: JSON.parse(req.headers['x-user-caps'] || '[]'),
  isAuthenticated: !!req.headers['authorization']
};

// From JWT token
const userContext = extractFromJWT(req.headers.authorization);

// From session
const userContext = await getUserFromSession(req.headers.cookie);
```

## Security Considerations

### ✅ **Safe Deduplication Patterns**

1. **Public content with no user-specific fields**
2. **Same user, multiple browser tabs/devices**  
3. **Users with identical roles and permissions**
4. **Anonymous users accessing public data**

### ❌ **Unsafe Deduplication Patterns**

1. **Mixing authenticated and anonymous results**
2. **Ignoring user roles in cache keys**
3. **Caching user-specific private data globally**
4. **Long TTL with frequently changing permissions**

### 🔒 **Security Best Practices**

1. **Always include user context** in cache keys
2. **Normalize user roles/capabilities** for consistent keys
3. **Use short TTL** for sensitive data (1-5 seconds)
4. **Regular security audits** of cache patterns
5. **Monitor cache hit rates** by user context
6. **Log cache key generation** for debugging

## Migration & Rollback

### Feature Flag Implementation
```typescript
const ENABLE_EXECUTION_CACHE = process.env.ENABLE_EXECUTION_CACHE === 'true';

if (ENABLE_EXECUTION_CACHE) {
  return await executionCache.executeWithDeduplication(subscription, subscriptionId, executor);
} else {
  return await executor(); // Original behavior
}
```

### Gradual Rollout
1. **Phase 1**: Enable for anonymous users only
2. **Phase 2**: Enable for authenticated users with public subscriptions
3. **Phase 3**: Enable for all subscriptions with full user context

### Performance Monitoring
```typescript
// Track cache effectiveness
const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  executionsSaved: 0,
  averageExecutionTime: 0
};
```

## Testing Strategy

### Unit Tests
- Cache key generation with various user contexts
- TTL expiration and cleanup
- Security isolation verification

### Integration Tests  
- Multiple concurrent subscriptions
- User permission changes during cache lifetime
- Cache behavior during high load

### Security Tests
- Verify no cross-user data leakage
- Test with various authentication states
- Validate cache key uniqueness

## Conclusion

Execution deduplication provides significant performance benefits while maintaining strict security isolation. The user-context-aware cache keys ensure that:

1. **Performance**: Redundant executions are eliminated
2. **Security**: User data is properly isolated  
3. **Scalability**: System handles high concurrent load
4. **Flexibility**: Works with any authentication system

**The key insight**: Deduplication is only safe when user contexts are identical. When in doubt, execute separately to maintain security.
