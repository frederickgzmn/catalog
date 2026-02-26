<?php

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * WordPress → SSE-2 Webhook Transport
 * 
 * Sends subscription events to the SSE-2 sidecar server via HTTP webhooks.
 * This maintains schema-agnostic design and allows SSE-2 to handle channel mapping.
 * 
 * Performance optimizations:
 * - Defers webhook sending to shutdown hook for better UX
 * - Uses non-blocking HTTP requests to prevent admin slowdown
 * - Implements retry logic with exponential backoff
 */

// Queue to store pending webhooks for batch sending
global $wpgraphql_sse_webhook_queue;
$wpgraphql_sse_webhook_queue = [];

// Get webhook secret from environment or wp-config
if ( ! defined( 'WPGRAPHQL_SSE_WEBHOOK_SECRET' ) ) {
    define( 'WPGRAPHQL_SSE_WEBHOOK_SECRET', wp_get_environment_type() === 'production' ? '' : 'dev-secret-key-change-in-production' );
}

// Get webhook URL from environment or wp-config  
if ( ! defined( 'WPGRAPHQL_SSE_WEBHOOK_URL' ) ) {
    define( 'WPGRAPHQL_SSE_WEBHOOK_URL', 'http://localhost:4000/webhook' );
}

/**
 * Queue a webhook for deferred sending (performance optimization)
 * 
 * @param string $event_type The GraphQL subscription event type
 * @param array $payload The event payload
 */
function wpgraphql_sse_queue_webhook( $event_type, $payload ) {
    global $wpgraphql_sse_webhook_queue;
    
    // Add to queue for later processing
    $wpgraphql_sse_webhook_queue[] = [
        'event_type' => $event_type,
        'payload' => $payload,
        'timestamp' => microtime( true ),
    ];
    
    error_log( "WPGraphQL SSE: Queued webhook for {$event_type} (queue size: " . count( $wpgraphql_sse_webhook_queue ) . ")" );
}

/**
 * Send subscription events to SSE-2 sidecar via webhook
 * 
 * @param string $event_type The GraphQL subscription event type
 * @param array $payload The event payload
 * @param bool $is_retry Whether this is a retry attempt
 */
function wpgraphql_sse_send_webhook( $event_type, $payload, $is_retry = false ) {
    // Skip if no webhook secret configured in production
    if ( wp_get_environment_type() === 'production' && empty( WPGRAPHQL_SSE_WEBHOOK_SECRET ) ) {
        error_log( 'WPGraphQL SSE: Webhook secret not configured for production' );
        return;
    }

    $json_payload = wp_json_encode( $payload );
    if ( false === $json_payload ) {
        error_log( 'WPGraphQL SSE: Failed to encode webhook payload' );
        return;
    }

    // Generate HMAC signature for security
    $signature = hash_hmac( 'sha256', $json_payload, WPGRAPHQL_SSE_WEBHOOK_SECRET );
    
    // Send to the SSE-2 sidecar server
    $response = wp_remote_post( 
        WPGRAPHQL_SSE_WEBHOOK_URL,
        [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Webhook-Signature' => 'sha256=' . $signature,
                'User-Agent' => 'WPGraphQL-SSE/' . get_bloginfo( 'version' ),
            ],
            'body' => $json_payload,
            'timeout' => 5,
            'blocking' => $is_retry, // Block for retries to get response, non-blocking for initial sends
        ]
    );
    
    // Handle response based on blocking mode
    if ( $is_retry ) {
        // For retries, we block and check the response
        if ( is_wp_error( $response ) ) {
            error_log( 'WPGraphQL SSE: Retry failed - ' . $response->get_error_message() );
            return false;
        } else {
            $response_code = wp_remote_retrieve_response_code( $response );
            $response_body = wp_remote_retrieve_body( $response );
            
            if ( $response_code >= 200 && $response_code < 300 ) {
                error_log( "WPGraphQL SSE: Retry succeeded - HTTP {$response_code}" );
                return true;
            } else {
                error_log( "WPGraphQL SSE: Retry failed - HTTP {$response_code}: {$response_body}" );
                return false;
            }
        }
    } else {
        // For initial sends (non-blocking), we can't check the response
        // If there's an immediate error (like connection refused), schedule retry
        if ( is_wp_error( $response ) ) {
            error_log( 'WPGraphQL SSE: Non-blocking webhook failed immediately - ' . $response->get_error_message() );
            wpgraphql_sse_schedule_retry( $event_type, $payload, 1 );
            return false;
        } else {
            // Non-blocking request was sent, assume success for now
            // Any failures will be handled by the SSE-2 server or retry logic
            error_log( "WPGraphQL SSE: Non-blocking webhook sent for {$event_type}" );
            return true;
        }
    }
}

/**
 * Schedule a webhook retry with exponential backoff
 * 
 * @param string $event_type The GraphQL subscription event type
 * @param array $payload The event payload
 * @param int $attempt_number Current attempt number (1-based)
 */
function wpgraphql_sse_schedule_retry( $event_type, $payload, $attempt_number ) {
    // Maximum retry attempts
    $max_attempts = 5;
    
    if ( $attempt_number > $max_attempts ) {
        error_log( "WPGraphQL SSE: Max retry attempts ({$max_attempts}) exceeded for {$event_type}" );
        return;
    }
    
    // Exponential backoff: 30s, 60s, 120s, 240s, 480s
    $delays = [ 30, 60, 120, 240, 480 ];
    $delay = $delays[ $attempt_number - 1 ] ?? 480;
    
    $retry_time = time() + $delay;
    
    // Schedule retry using WordPress cron
    wp_schedule_single_event( 
        $retry_time, 
        'wpgraphql_sse_retry_webhook', 
        [ $event_type, $payload, $attempt_number ] 
    );
    
    error_log( "WPGraphQL SSE: Scheduled retry #{$attempt_number} for {$event_type} in {$delay} seconds" );
}

/**
 * Handle webhook retry attempts
 * 
 * @param string $event_type The GraphQL subscription event type
 * @param array $payload The event payload
 * @param int $attempt_number Current attempt number (1-based)
 */
function wpgraphql_sse_handle_retry( $event_type, $payload, $attempt_number ) {
    error_log( "WPGraphQL SSE: Attempting retry #{$attempt_number} for {$event_type}" );
    
    // Try to send the webhook again (blocking for retries)
    $success = wpgraphql_sse_send_webhook( $event_type, $payload, true );
    
    if ( ! $success ) {
        // Schedule next retry if this one failed
        wpgraphql_sse_schedule_retry( $event_type, $payload, $attempt_number + 1 );
    } else {
        error_log( "WPGraphQL SSE: Retry #{$attempt_number} succeeded for {$event_type}" );
    }
}

/**
 * Process queued webhooks at shutdown for better performance
 * This runs after the response is sent to the user, preventing admin slowdown
 */
function wpgraphql_sse_process_webhook_queue() {
    global $wpgraphql_sse_webhook_queue;
    
    if ( empty( $wpgraphql_sse_webhook_queue ) ) {
        return;
    }
    
    $queue_size = count( $wpgraphql_sse_webhook_queue );
    $start_time = microtime( true );
    
    error_log( "WPGraphQL SSE: Processing {$queue_size} queued webhooks at shutdown" );
    
    foreach ( $wpgraphql_sse_webhook_queue as $webhook ) {
        wpgraphql_sse_send_webhook( 
            $webhook['event_type'], 
            $webhook['payload'], 
            false // Non-blocking
        );
    }
    
    $duration = round( ( microtime( true ) - $start_time ) * 1000, 2 );
    error_log( "WPGraphQL SSE: Processed {$queue_size} webhooks in {$duration}ms" );
    
    // Clear the queue
    $wpgraphql_sse_webhook_queue = [];
}

/**
 * Clean up old scheduled retries on plugin deactivation
 */
function wpgraphql_sse_cleanup_retries() {
    wp_clear_scheduled_hook( 'wpgraphql_sse_retry_webhook' );
}

// Hook into the GraphQL subscription event system (queue for later processing)
add_action( 'graphql_subscription_event', 'wpgraphql_sse_queue_webhook', 10, 2 );

// Process queued webhooks at shutdown (after response sent to user)
add_action( 'shutdown', 'wpgraphql_sse_process_webhook_queue', 1 );

// Hook for retry attempts
add_action( 'wpgraphql_sse_retry_webhook', 'wpgraphql_sse_handle_retry', 10, 3 );

// Clean up on deactivation
register_deactivation_hook( __FILE__, 'wpgraphql_sse_cleanup_retries' );