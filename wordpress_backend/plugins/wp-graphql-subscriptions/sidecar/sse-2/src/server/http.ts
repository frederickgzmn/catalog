/**
 * HTTP Server implementation with content negotiation
 * Handles GraphQL requests, GraphiQL IDE, and SSE subscriptions
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { parse, validate, buildSchema, getOperationAST } from 'graphql';
import type { Logger } from 'pino';
import type { ServerConfig, ContentNegotiation, GraphQLRequest } from '../types/index.js';
import { generateRequestId, createRequestLogger } from '../logger/index.js';
import { RedisClient } from '../redis/client.js';
import { SubscriptionManager } from '../subscription/manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class HTTPServer {
  private server: ReturnType<typeof createServer>;
  private logger: Logger;
  private config: ServerConfig;
  private redisClient: RedisClient;
  private subscriptionManager: SubscriptionManager;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.server = createServer(this.handleRequest.bind(this));
    
    // Initialize Redis client and subscription manager
    this.redisClient = new RedisClient(config, logger);
    this.subscriptionManager = new SubscriptionManager(this.redisClient, config, logger);
    
    // Server event handlers
    this.server.on('listening', () => {
      this.logger.info({
        port: this.config.port,
        host: this.config.host,
      }, 'HTTP server listening');
    });

    this.server.on('error', (error) => {
      this.logger.error({ error }, 'HTTP server error');
    });

    this.server.on('close', () => {
      this.logger.info('HTTP server closed');
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    // Connect to Redis first
    await this.redisClient.connect();
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    // Clean up subscriptions and disconnect from Redis
    await this.subscriptionManager.cleanup();
    await this.redisClient.disconnect();
    
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  /**
   * Main request handler with content negotiation
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = generateRequestId();
    const requestLogger = createRequestLogger(this.logger, {
      requestId,
      method: req.method || 'UNKNOWN',
      url: req.url || '/',
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : undefined,
    });

    const startTime = Date.now();
    requestLogger.info('Request received');

    try {
      // Add CORS headers
      this.addCORSHeaders(res, req);

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parse URL
      const parsedUrl = parseUrl(req.url || '/', true);
      
      // Determine content negotiation
      const negotiation = this.determineContentNegotiation(req);
      
      // Route to appropriate handler
      if (parsedUrl.pathname === '/graphql') {
        // Handle GraphQL endpoint
        await this.handleGraphQLEndpoint(req, res, requestLogger, parsedUrl, negotiation);
      } else if (parsedUrl.pathname === '/webhook' && req.method === 'POST') {
        // Handle WordPress webhook events
        await this.handleWebhookEvent(req, res, requestLogger);
      } else if (parsedUrl.pathname?.startsWith('/static/') || parsedUrl.pathname?.endsWith('.js') || parsedUrl.pathname?.endsWith('.map')) {
        // Handle static files (GraphiQL bundle)
        await this.handleStaticFile(req, res, requestLogger, parsedUrl.pathname);
      } else {
        this.sendNotFound(res, requestLogger);
        return;
      }

    } catch (error) {
      requestLogger.error({ error }, 'Request error');
      this.sendInternalServerError(res, error);
    } finally {
      const duration = Date.now() - startTime;
      requestLogger.info({ duration }, 'Request completed');
    }
  }

  /**
   * Determine content negotiation from request
   */
  private determineContentNegotiation(req: IncomingMessage): ContentNegotiation {
    const method = (req.method?.toUpperCase() || 'GET') as 'GET' | 'POST' | 'OPTIONS';
    const accept = req.headers.accept || '';
    
    return {
      method,
      acceptsHtml: accept.includes('text/html'),
      acceptsJson: accept.includes('application/json'),
      acceptsEventStream: accept.includes('text/event-stream'),
    };
  }

  /**
   * Add CORS headers to response
   */
  private addCORSHeaders(res: ServerResponse, req?: IncomingMessage): void {
    // Get the origin from the request
    const requestOrigin = req?.headers.origin;
    
    // Check if the request origin is in our allowed list
    if (requestOrigin && this.config.corsOrigin.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else {
      // When credentials are included, we MUST use a specific origin, not '*'
      // Fallback to the first allowed origin (typically localhost:3000)
      const fallbackOrigin = this.config.corsOrigin[0] || 'http://localhost:3000';
      res.setHeader('Access-Control-Allow-Origin', fallbackOrigin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

    /**
   * Handle static file requests (JS, CSS, maps)
   */
  private async handleStaticFile(req: IncomingMessage, res: ServerResponse, logger: Logger, pathname: string): Promise<void> {
    try {
      const publicDir = join(__dirname, '../../dist/public');
      const filename = pathname.replace(/^\/static\//, '').replace(/^\//, '');
      const filePath = join(publicDir, filename);

      // Security check - ensure file is within public directory
      if (!filePath.startsWith(publicDir)) {
        this.sendNotFound(res, logger);
        return;
      }

      // Check if file exists
      await stat(filePath);

      // Read file
      const content = await readFile(filePath);

      // Determine content type
      const ext = extname(filePath).toLowerCase();
      const contentType = this.getContentType(ext);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      });
      res.end(content);

      logger.debug({ pathname, filePath, contentType }, 'Served static file');

    } catch (error) {
      logger.warn({ pathname, error }, 'Static file not found');
      this.sendNotFound(res, logger);
    }
  }

  /**
   * Get content type for file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.js': 'application/javascript',
      '.map': 'application/json',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Handle GraphiQL IDE requests (GET + text/html)
   */
  private async handleGraphiQL(req: IncomingMessage, res: ServerResponse, logger: Logger): Promise<void> {
    logger.info('Serving custom GraphiQL IDE');

    // Serve the built GraphiQL HTML
    const graphiqlHtml = await this.loadCustomGraphiQLHTML();
    
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(graphiqlHtml),
    });
    res.end(graphiqlHtml);
  }

  /**
   * Handle introspection queries (POST + application/json)
   */
  private async handleIntrospection(req: IncomingMessage, res: ServerResponse, logger: Logger): Promise<void> {
    logger.info('Handling introspection request');
    
    try {
      // Parse request body
      const body = await this.parseRequestBody(req);
      const graphqlRequest: GraphQLRequest = JSON.parse(body);
      
      // Forward headers for authentication
      const forwardHeaders: Record<string, string> = {};
      if (req.headers.authorization) {
        forwardHeaders.authorization = req.headers.authorization;
      }
      if (req.headers.cookie) {
        forwardHeaders.cookie = req.headers.cookie;
      }
      
      // Use the extracted introspection logic
      await this.handleIntrospectionQuery(graphqlRequest, res, logger, forwardHeaders);
      
    } catch (error) {
      logger.error({ error }, 'Introspection error');
      this.sendGraphQLError(res, 'Failed to process introspection request');
    }
  }

  /**
   * Handle SSE subscription requests from query parameters (GET + text/event-stream)
   */
  private async handleSSESubscriptionFromQuery(req: IncomingMessage, res: ServerResponse, logger: Logger, parsedUrl: any): Promise<void> {
    logger.info('Handling SSE subscription request from query parameters');
    
    try {
      // Extract GraphQL request from query parameters
      const query = parsedUrl.query?.query;
      const variables = parsedUrl.query?.variables ? JSON.parse(parsedUrl.query.variables) : undefined;
      const operationName = parsedUrl.query?.operationName;
      
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          errors: [{
            message: 'Missing query parameter',
            extensions: { code: 'MISSING_QUERY' }
          }]
        }));
        return;
      }
      
      const graphqlRequest = { query, variables, operationName };
      
      // Capture headers for authentication
      const requestHeaders: Record<string, string> = {};
      if (req.headers.cookie) {
        requestHeaders.cookie = req.headers.cookie;
      }
      if (req.headers.authorization) {
        requestHeaders.authorization = req.headers.authorization;
      }
      
      await this.processSSESubscription(graphqlRequest, res, logger, req, requestHeaders);
      
    } catch (error) {
      logger.error({ error }, 'SSE subscription from query error');
      
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errors: [{
          message: 'Failed to process subscription request',
          extensions: { code: 'INTERNAL_ERROR' }
        }]
      }));
    }
  }

  /**
   * Handle SSE subscriptions with pre-parsed body
   */
  private async handleSSESubscriptionWithBody(body: string, res: ServerResponse, logger: Logger): Promise<void> {
    try {
      const graphqlRequest: GraphQLRequest = JSON.parse(body);
      await this.processSSESubscription(graphqlRequest, res, logger, undefined);
    } catch (error) {
      logger.error({ error }, 'Failed to parse GraphQL request for SSE subscription');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errors: [{
          message: 'Invalid GraphQL request',
          extensions: { code: 'INVALID_REQUEST' }
        }]
      }));
    }
  }

  /**
   * Handle introspection query with GraphQL request object
   */
  private async handleIntrospectionQuery(graphqlRequest: GraphQLRequest, res: ServerResponse, logger: Logger, forwardHeaders: Record<string, string>): Promise<void> {
    try {
      logger.debug({ query: graphqlRequest.query?.substring(0, 100) + '...' }, 'Proxying request to WPGraphQL');
      
      // Proxy to WPGraphQL
      const { WPGraphQLClient } = await import('../graphql/client.js');
      const client = new WPGraphQLClient(this.config, logger);
      const response = await client.executeRequest(graphqlRequest, forwardHeaders);
      
      this.sendJSON(res, response);
    } catch (error) {
      logger.error({ error }, 'Introspection query error');
      this.sendGraphQLError(res, 'Failed to process introspection request');
    }
  }

  /**
   * Handle introspection queries with pre-parsed body
   */
  private async handleIntrospectionWithBody(body: string, res: ServerResponse, logger: Logger): Promise<void> {
    try {
      const graphqlRequest: GraphQLRequest = JSON.parse(body);
      // Process as regular GraphQL query (not SSE) - delegate to existing introspection handler
      logger.info('Handling introspection request with pre-parsed body');
      
      // Use the extracted introspection logic
      await this.handleIntrospectionQuery(graphqlRequest, res, logger, {});
    } catch (error) {
      logger.error({ error }, 'Failed to parse GraphQL request for introspection');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errors: [{
          message: 'Invalid GraphQL request',
          extensions: { code: 'INVALID_REQUEST' }
        }]
      }));
    }
  }

  /**
   * Handle SSE subscription requests (POST + text/event-stream)
   */
  private async handleSSESubscription(req: IncomingMessage, res: ServerResponse, logger: Logger): Promise<void> {
    logger.info('Handling SSE subscription request');
    
    try {
      // Parse request body
      const body = await this.parseRequestBody(req);
      const graphqlRequest: GraphQLRequest = JSON.parse(body);
      
      // Capture headers for authentication
      const requestHeaders: Record<string, string> = {};
      if (req.headers.cookie) {
        requestHeaders.cookie = req.headers.cookie;
      }
      if (req.headers.authorization) {
        requestHeaders.authorization = req.headers.authorization;
      }
      
      await this.processSSESubscription(graphqlRequest, res, logger, req, requestHeaders);
      
    } catch (error) {
      logger.error({ error }, 'SSE subscription error');
      
      // Send error response
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errors: [{
          message: 'Failed to process subscription request',
          extensions: { code: 'INTERNAL_ERROR' }
        }]
      }));
    }
  }

  /**
   * Validate GraphQL subscription before processing
   */
  private async validateSubscription(graphqlRequest: GraphQLRequest): Promise<{ isValid: boolean; errors?: any[] }> {
    try {
      // Parse the query to check syntax
      const document = parse(graphqlRequest.query);
      
      // Get the operation AST
      const operationAST = getOperationAST(document, graphqlRequest.operationName);
      
      if (!operationAST) {
        return {
          isValid: false,
          errors: [{
            message: `Operation "${graphqlRequest.operationName || 'unnamed'}" not found in query`,
            locations: []
          }]
        };
      }
      
      if (operationAST.operation !== 'subscription') {
        return {
          isValid: false,
          errors: [{
            message: `Operation must be a subscription, got ${operationAST.operation}`,
            locations: []
          }]
        };
      }

      // Check for required variables
      const variableDefinitions = operationAST.variableDefinitions || [];
      const providedVariables = graphqlRequest.variables || {};
      
      const missingVariables: string[] = [];
      
      for (const varDef of variableDefinitions) {
        const varName = varDef.variable.name.value;
        const isRequired = varDef.type.kind === 'NonNullType';
        
        if (isRequired && !(varName in providedVariables)) {
          missingVariables.push(varName);
        }
      }
      
      if (missingVariables.length > 0) {
        return {
          isValid: false,
          errors: missingVariables.map(varName => ({
            message: `Variable "$${varName}" of required type was not provided.`,
            locations: []
          }))
        };
      }
      
      return { isValid: true };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          message: `GraphQL syntax error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          locations: []
        }]
      };
    }
  }

  /**
   * Process SSE subscription (shared logic for GET and POST)
   */
  private async processSSESubscription(
    graphqlRequest: GraphQLRequest, 
    res: ServerResponse, 
    logger: Logger, 
    req?: IncomingMessage,
    requestHeaders?: Record<string, string>
  ): Promise<void> {
    // Validate the subscription before processing
    const validation = await this.validateSubscription(graphqlRequest);
    
    if (!validation.isValid) {
      logger.warn({ errors: validation.errors }, 'Subscription validation failed');
      
      // Build error response headers (including CORS)
      const errorHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add CORS headers
      const requestOrigin = req?.headers.origin;
      if (requestOrigin && this.config.corsOrigin.includes(requestOrigin)) {
        errorHeaders['Access-Control-Allow-Origin'] = requestOrigin;
      } else {
        errorHeaders['Access-Control-Allow-Origin'] = this.config.corsOrigin[0] || 'http://localhost:3000';
      }
      errorHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      errorHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Cache-Control';
      errorHeaders['Access-Control-Allow-Credentials'] = 'true';

      // Send validation error as JSON response
      res.writeHead(400, errorHeaders);
      
      res.end(JSON.stringify({
        errors: validation.errors
      }));
      
      return;
    }

    logger.info('Subscription validation passed, establishing SSE connection');
    
    // Build all headers first (including CORS)
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    };

    // Add CORS headers
    const requestOrigin = req?.headers.origin;
    if (requestOrigin && this.config.corsOrigin.includes(requestOrigin)) {
      headers['Access-Control-Allow-Origin'] = requestOrigin;
    } else {
      headers['Access-Control-Allow-Origin'] = this.config.corsOrigin[0] || 'http://localhost:3000';
    }
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Cache-Control';
    headers['Access-Control-Allow-Credentials'] = 'true';

    // Set up SSE headers with enhanced compatibility for incognito mode
    res.writeHead(200, headers);
    
    // Send initial connection event with explicit flush for incognito compatibility
    res.write('retry: 10000\n'); // Set retry interval
    res.write('event: next\n');
    res.write('data: {"data":{"message":"Subscription established - waiting for events..."}}\n\n');
    
    // Force flush the initial event for incognito browsers
    if ('flush' in res && typeof res.flush === 'function') {
      (res as any).flush();
    }
    
    // Generate unique subscription ID
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create subscription with the manager, including request context
      await this.subscriptionManager.createSubscription(
        subscriptionId,
        graphqlRequest,
        res,
        requestHeaders ? { headers: requestHeaders } : undefined
      );
      
      logger.info({ subscriptionId }, 'Subscription created successfully');
      
    } catch (subscriptionError) {
      logger.error({ subscriptionError, subscriptionId }, 'Failed to create subscription');
      
      // Send error and complete
      res.write('event: next\n');
      res.write(`data: {"errors":[{"message":"Failed to create subscription: ${subscriptionError instanceof Error ? subscriptionError.message : 'Unknown error'}"}]}\n\n`);
      res.write('event: complete\n');
      res.write('data: \n\n');
      res.end();
      return;
    }
    
    // Handle client disconnect
    res.on('close', () => {
      logger.info({ subscriptionId }, 'SSE connection closed by client');
      this.subscriptionManager.removeSubscription(subscriptionId);
    });
    
    res.on('error', (error) => {
      logger.error({ error, subscriptionId }, 'SSE connection error');
      this.subscriptionManager.removeSubscription(subscriptionId);
    });
  }

  /**
   * Check if a request contains a subscription operation
   */
  private async isSubscriptionRequest(body: string, logger: Logger): Promise<boolean> {
    try {
      const data = JSON.parse(body);
      const query = data.query || '';
      
      // More precise check for subscription operation
      const trimmedQuery = query.trim().toLowerCase();
      
      // Check if it starts with 'subscription' keyword (ignoring whitespace and comments)
      const cleanQuery = trimmedQuery.replace(/^\s*#.*$/gm, '').trim();
      const isSubscription = /^\s*subscription\s+/i.test(cleanQuery);
      
      logger.debug({ isSubscription, queryStart: cleanQuery.substring(0, 50) }, 'Subscription detection');
      
      return isSubscription;
    } catch (error) {
      logger.debug({ error }, 'Failed to parse request body for subscription check');
      return false;
    }
  }

  /**
   * Parse request body as string
   */
  private async parseRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * Load custom GraphiQL HTML from built bundle
   */
  private async loadCustomGraphiQLHTML(): Promise<string> {
    try {
      const htmlPath = join(__dirname, '../../dist/public/graphiql.html');
      const html = await readFile(htmlPath, 'utf-8');
      return html;
    } catch (error) {
      this.logger.error({ error }, 'Failed to load custom GraphiQL HTML');
      // Fallback to simple HTML
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WPGraphQL Subscriptions IDE - Loading Error</title>
</head>
<body>
  <div style="padding: 20px; font-family: Arial, sans-serif;">
    <h1>GraphiQL Loading Error</h1>
    <p>The custom GraphiQL bundle could not be loaded. Please run:</p>
    <code>npm run build:graphiql</code>
    <p>Then restart the server.</p>
  </div>
</body>
</html>`;
    }
  }



  /**
   * Send JSON response
   */
  private sendJSON(res: ServerResponse, data: any): void {
    const json = JSON.stringify(data);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  }

  /**
   * Send GraphQL error response
   */
  private sendGraphQLError(res: ServerResponse, message: string): void {
    this.sendJSON(res, {
      data: null,
      errors: [{ message }],
    });
  }

  /**
   * Send 404 Not Found
   */
  private sendNotFound(res: ServerResponse, logger: Logger): void {
    logger.warn('Not found');
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  /**
   * Send 405 Method Not Allowed
   */
  private sendMethodNotAllowed(res: ServerResponse, logger: Logger, negotiation: ContentNegotiation): void {
    logger.warn({ negotiation }, 'Method not allowed');
    res.writeHead(405, { 
      'Content-Type': 'application/json',
      'Allow': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify({
      error: 'Method Not Allowed',
      message: 'This endpoint supports: GET (GraphiQL or SSE subscriptions), POST + application/json (introspection), POST + text/event-stream (subscriptions)',
      received: negotiation,
    }));
  }

  /**
   * Send 500 Internal Server Error
   */
  private sendInternalServerError(res: ServerResponse, error: unknown): void {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }));
  }

  /**
   * Handle GraphQL endpoint with content negotiation
   */
  private async handleGraphQLEndpoint(
    req: IncomingMessage, 
    res: ServerResponse, 
    logger: Logger, 
    parsedUrl: any, 
    negotiation: ContentNegotiation
  ): Promise<void> {
    // Route based on content negotiation
    if (negotiation.method === 'GET' && negotiation.acceptsHtml) {
      // Serve GraphiQL IDE
      await this.handleGraphiQL(req, res, logger);
    } else if (negotiation.method === 'GET' && negotiation.acceptsEventStream) {
      // Handle SSE subscriptions via GET (from GraphiQL)
      await this.handleSSESubscriptionFromQuery(req, res, logger, parsedUrl);
    } else if (negotiation.method === 'POST' && negotiation.acceptsEventStream) {
      // Handle SSE subscriptions via POST
      await this.handleSSESubscription(req, res, logger);
    } else if (negotiation.method === 'POST' && negotiation.acceptsJson) {
      // Check if this is a subscription operation first
      const body = await this.parseRequestBody(req);
      const isSubscription = await this.isSubscriptionRequest(body, logger);
      
      if (isSubscription) {
        // Handle SSE subscriptions via POST (recreate request with body)
        await this.handleSSESubscriptionWithBody(body, res, logger);
      } else {
        // Handle introspection queries (recreate request with body)
        await this.handleIntrospectionWithBody(body, res, logger);
      }
    } else {
      // Unsupported request
      this.sendMethodNotAllowed(res, logger, negotiation);
    }
  }

  /**
   * Handle WordPress webhook events
   */
  private async handleWebhookEvent(req: IncomingMessage, res: ServerResponse, logger: Logger): Promise<void> {
    logger.info('Handling WordPress webhook event');
    
    try {
      // Parse request body
      const body = await this.parseRequestBody(req);
      const eventData = JSON.parse(body);
      
      logger.info({ eventData }, 'Received WordPress event');

      // Validate webhook signature for security
      if (!this.validateWebhookSignature(req, body)) {
        logger.warn('Invalid webhook signature');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Invalid webhook signature'
        }));
        return;
      }
      
      // Extract event information
      const { node_type, action, node_id, context, metadata } = eventData;
      
      if (!node_type || !action || !node_id) {
        logger.warn({ eventData }, 'Invalid webhook event - missing required fields');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Invalid event format',
          message: 'Missing required fields: node_type, action, node_id'
        }));
        return;
      }

      // Generate event type for logging (schema-agnostic)
      const eventType = `${node_type}${action.charAt(0) + action.slice(1).toLowerCase()}`; // e.g. "postUpdate", "commentCreate"

      // Get Redis client (we'll need to initialize this in the constructor)
      if (!this.redisClient) {
        logger.error('Redis client not initialized');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Redis not available',
          message: 'Redis client not initialized'
        }));
        return;
      }

      // WordPress must provide channels for schema-agnostic operation
      if (!eventData.channels || !Array.isArray(eventData.channels) || eventData.channels.length === 0) {
        logger.error({ node_type, action, node_id }, 'WordPress must provide channels array for schema-agnostic operation');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Missing channels',
          message: 'WordPress must provide channels array in webhook payload for schema-agnostic operation'
        }));
        return;
      }

      const channels: string[] = eventData.channels;
      logger.info({ 
        eventType,
        node_id,
        channels: channels.length,
        channelList: channels 
      }, 'Processing WordPress event with provided channels');
      
      logger.info({ eventType, node_id, channels }, 'Publishing to Redis channels');
      
      // Create event payload for subscribers
      const subscriptionPayload = {
        id: String(node_id),
        action,
        timestamp: metadata?.timestamp || Date.now(),
        ...context
      };

      // Publish to all relevant channels
      let publishCount = 0;
      for (const channel of channels) {
        try {
          await this.redisClient.publish(channel, subscriptionPayload);
          publishCount++;
          logger.debug({ channel, payload: subscriptionPayload }, 'Published to Redis channel');
        } catch (error) {
          logger.error({ error, channel }, 'Failed to publish to Redis channel');
        }
      }

      // Send success response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        event_type: eventType,
        channels_published: publishCount,
        total_channels: channels.length,
      }));

      logger.info({ 
        eventType, 
        node_id, 
        publishCount, 
        totalChannels: channels.length 
      }, 'WordPress event processed successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to process webhook event');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: 'Failed to process webhook event'
      }));
    }
  }

  /**
   * Validate webhook signature for security
   */
  private validateWebhookSignature(req: IncomingMessage, body: string): boolean {
    // Get webhook secret from environment
    const webhookSecret = process.env.WEBHOOK_SECRET || 'dev-secret-key-change-in-production';
    
    // Skip validation in development if no secret is set
    if (process.env.NODE_ENV !== 'production' && webhookSecret === 'dev-secret-key-change-in-production') {
      this.logger.debug('Skipping webhook signature validation in development');
      return true;
    }

    // Get signature from header
    const signatureHeader = req.headers['x-webhook-signature'];
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      this.logger.warn('Missing webhook signature header');
      return false;
    }

    // Parse signature (format: "sha256=<signature>")
    const [algorithm, signature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !signature) {
      this.logger.warn({ signatureHeader }, 'Invalid webhook signature format');
      return false;
    }

    // Calculate expected signature
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(body, 'utf8')
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      if (signatureBuffer.length !== expectedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error({ error }, 'Error validating webhook signature');
      return false;
    }
  }


}
