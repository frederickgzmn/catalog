# Multi-Tenant SSE-2 Architecture

## Overview

The current SSE-2 implementation is designed as a **single-tenant system** where one SSE-2 instance serves one WordPress installation. For **multi-tenant SaaS scenarios**, significant architectural changes would be required.

## Current Single-Tenant Limitations

### Authentication
- **Single webhook secret**: All webhooks use same `WEBHOOK_SECRET`
- **Single subscription secret**: All GraphQL subscriptions use same `SUBSCRIPTION_SECRET`  
- **No tenant identification**: No way to distinguish between different WordPress installations

### Data Isolation
- **Shared Redis namespace**: All tenants would share same Redis channels
- **No tenant-scoped subscriptions**: Cross-tenant data leakage possible
- **Single configuration**: All tenants must use same SSE-2 settings

## Multi-Tenant Architecture Options

### Option 1: Tenant-Aware Single Instance

```typescript
interface TenantConfig {
  tenantId: string;
  wpgraphqlEndpoint: string;
  webhookSecret: string;
  subscriptionSecret: string;
  redisPrefix: string;
  rateLimits?: RateLimitConfig;
  corsOrigins: string[];
}

interface TenantRegistry {
  [tenantId: string]: TenantConfig;
}
```

**Webhook Authentication:**
```http
POST /webhook
Headers:
  X-Tenant-ID: tenant_abc123
  X-Webhook-Signature: sha256=...
  Content-Type: application/json

Body:
{
  "tenant_id": "tenant_abc123",
  "node_type": "post",
  "action": "UPDATE",
  "channels": ["post_123_updates"]
}
```

**Benefits:**
- ✅ Single SSE-2 instance to manage
- ✅ Shared infrastructure costs
- ✅ Centralized monitoring

**Challenges:**
- ❌ Complex tenant isolation logic
- ❌ Shared failure points
- ❌ Scaling bottlenecks

### Option 2: Isolated Per-Tenant Instances

```
Multi-Tenant SaaS Platform
├── Tenant A: Dedicated SSE-2 + Redis + Domain
├── Tenant B: Dedicated SSE-2 + Redis + Domain  
├── Tenant C: Dedicated SSE-2 + Redis + Domain
└── Management API: Tenant provisioning & monitoring
```

**Benefits:**
- ✅ Complete tenant isolation
- ✅ Independent scaling
- ✅ Fault isolation
- ✅ Custom configurations per tenant

**Challenges:**
- ❌ Higher infrastructure costs
- ❌ Complex orchestration
- ❌ Monitoring complexity

### Option 3: Hybrid Architecture

```
Load Balancer (tenant routing)
├── SSE-2 Cluster A (tenants 1-100)
├── SSE-2 Cluster B (tenants 101-200)
└── SSE-2 Cluster C (tenants 201-300)

Each cluster:
- Shared Redis with tenant prefixes
- Tenant-aware authentication
- Resource limits per tenant
```

## Implementation Requirements

### 1. Tenant Authentication

**Webhook Validation:**
```typescript
class MultiTenantWebhookValidator {
  private tenantConfigs: Map<string, TenantConfig>;
  
  validateWebhook(req: IncomingMessage, body: string): TenantValidation {
    const tenantId = req.headers['x-tenant-id'] as string;
    const signature = req.headers['x-webhook-signature'] as string;
    
    const config = this.tenantConfigs.get(tenantId);
    if (!config) {
      return { valid: false, error: 'Unknown tenant' };
    }
    
    const isValidSignature = this.validateHMAC(
      body, 
      signature, 
      config.webhookSecret
    );
    
    return { 
      valid: isValidSignature, 
      tenantId,
      config 
    };
  }
}
```

### 2. Data Isolation

**Redis Namespace Strategy:**
```typescript
class TenantRedisManager {
  getChannelName(tenantId: string, channel: string): string {
    return `tenant:${tenantId}:${channel}`;
  }
  
  async publishToTenant(
    tenantId: string, 
    channel: string, 
    payload: any
  ): Promise<void> {
    const namespacedChannel = this.getChannelName(tenantId, channel);
    await this.redis.publish(namespacedChannel, payload);
  }
}
```

### 3. Subscription Routing

**Tenant-Aware GraphQL:**
```typescript
app.post('/graphql/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const tenantConfig = await this.getTenantConfig(tenantId);
  
  if (!tenantConfig) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  
  // Route to tenant-specific GraphQL handler
  return this.handleTenantGraphQL(tenantId, tenantConfig, req, res);
});
```

### 4. Rate Limiting & Resource Management

```typescript
interface TenantLimits {
  maxConcurrentSubscriptions: number;
  maxWebhooksPerMinute: number;
  maxRedisMemoryMB: number;
  maxConnectionsPerIP: number;
}

class TenantResourceManager {
  enforceRateLimits(tenantId: string, operation: string): boolean {
    const limits = this.getTenantLimits(tenantId);
    return this.rateLimiter.check(tenantId, operation, limits);
  }
}
```

## Configuration Management

### Tenant Provisioning API

```typescript
// POST /admin/tenants
{
  "tenant_id": "customer_abc123",
  "wpgraphql_endpoint": "https://customer.example.com/graphql",
  "webhook_secret": "generated_webhook_secret",
  "subscription_secret": "generated_subscription_secret",
  "cors_origins": ["https://customer.example.com"],
  "rate_limits": {
    "max_concurrent_subscriptions": 100,
    "max_webhooks_per_minute": 1000
  }
}
```

### WordPress Plugin Auto-Configuration

```php
// Auto-configure WordPress plugin via API
class WPGraphQL_SSE_Tenant_Config {
    public function configure_tenant($api_key) {
        $response = wp_remote_post('https://sse-saas.com/api/tenant/config', [
            'headers' => ['Authorization' => "Bearer {$api_key}"],
            'body' => json_encode([
                'wpgraphql_endpoint' => home_url('/graphql'),
                'domain' => get_site_url()
            ])
        ]);
        
        $config = json_decode(wp_remote_retrieve_body($response), true);
        
        // Auto-set wp-config constants
        $this->update_wp_config([
            'WPGRAPHQL_SSE_ENDPOINT' => $config['sse_endpoint'],
            'WPGRAPHQL_SSE_WEBHOOK_SECRET' => $config['webhook_secret'],
            'WPGRAPHQL_SUBSCRIPTION_SECRET' => $config['subscription_secret']
        ]);
    }
}
```

## Migration Path

### Phase 1: Tenant Registry
- Add tenant identification to current system
- Implement tenant-aware webhook validation
- Maintain backward compatibility

### Phase 2: Data Isolation  
- Implement Redis namespacing
- Add tenant-scoped subscriptions
- Tenant-aware rate limiting

### Phase 3: Full Multi-Tenancy
- Complete tenant isolation
- Management dashboard
- Automated provisioning

## Security Considerations

### Tenant Isolation
- **Redis namespacing**: Prevent cross-tenant data access
- **GraphQL schema isolation**: Tenant-specific introspection
- **Network isolation**: VPC/subnet separation for sensitive tenants

### Authentication Hierarchy
```
1. Platform API Key (admin operations)
2. Tenant API Key (tenant management)  
3. Webhook Secret (WordPress → SSE-2)
4. Subscription Secret (GraphQL subscriptions)
```

### Audit Logging
```typescript
interface TenantAuditLog {
  tenantId: string;
  operation: 'webhook' | 'subscription' | 'admin';
  timestamp: number;
  sourceIP: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}
```

## Cost Considerations

### Resource Allocation
- **Redis memory**: Per-tenant quotas and monitoring
- **CPU limits**: Prevent tenant resource starvation  
- **Bandwidth**: Track and limit per-tenant usage
- **Storage**: Audit logs and metrics per tenant

### Pricing Models
- **Per-subscription**: Charge based on active subscriptions
- **Per-event**: Charge based on webhook volume
- **Tiered plans**: Different limits per plan level
- **Enterprise**: Dedicated instances for large customers

## Monitoring & Observability

### Per-Tenant Metrics
```typescript
interface TenantMetrics {
  activeSubscriptions: number;
  webhooksPerMinute: number;
  redisMemoryUsage: number;
  errorRate: number;
  latencyP99: number;
}
```

### Health Checks
- Tenant-specific health endpoints
- Redis namespace health
- WordPress connectivity per tenant
- Rate limit status per tenant

## Conclusion

Multi-tenancy would require **significant architectural changes** but is definitely achievable. The current single-tenant design provides a solid foundation that could be extended with:

1. **Tenant identification and authentication**
2. **Data isolation via Redis namespacing** 
3. **Resource management and rate limiting**
4. **Centralized tenant configuration**

**Recommendation**: Start with Option 2 (isolated instances) for initial SaaS offering, then consider Option 3 (hybrid) as scale increases.

---

*This document serves as a architectural blueprint for future multi-tenant considerations. The current single-tenant implementation remains the focus for immediate development.*
