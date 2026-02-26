<?php
/**
 * Register Root Subscription type and fields.
 */
add_action( 'graphql_register_types', function() {
    register_graphql_object_type(
        'RootSubscription',
        [
            'description' => __( 'Root subscription type. Entry point for all subscriptions.', 'wpgraphql-subscriptions' ),
            'fields'      => [], // Fields are added via register_graphql_field().
        ]
    );

    register_graphql_field( 'RootSubscription', 'postUpdated', [
        'description' => __( 'Subscription for post updates.', 'wpgraphql-subscriptions' ),
        'type'        => 'Post',
        'args'        => [
            'id' => [
                'type'        => 'ID',
                'description' => __( 'The ID of the post to subscribe to.', 'wpgraphql-subscriptions' ),
            ],
        ],
        'resolve' => function( $root, $args, $context, $info ) {
            // This resolver is called when the subscription is executed
            // For subscriptions, the actual data comes from the SSE stream events
            
            // Debug logging
            error_log( 'WPGraphQL-SSE: postUpdated resolver called' );
            error_log( 'WPGraphQL-SSE: Args: ' . json_encode( $args ) );
            error_log( 'WPGraphQL-SSE: Root type: ' . gettype( $root ) );
            if ( is_array( $root ) ) {
                error_log( 'WPGraphQL-SSE: Root keys: ' . implode( ', ', array_keys( $root ) ) );
            } else {
                error_log( 'WPGraphQL-SSE: Root is not an array, it is: ' . ( is_null( $root ) ? 'null' : gettype( $root ) ) );
            }
            
            // Get the requested post ID from subscription arguments
            $requested_id = isset( $args['id'] ) ? absint( $args['id'] ) : null;
            error_log( "WPGraphQL-SSE: Requested ID: {$requested_id}" );
            
            // If we have event data from the subscription, extract the post data
            if ( isset( $root['postUpdated'] ) ) {
                $event_data = $root['postUpdated'];
                error_log( 'WPGraphQL-SSE: Found postUpdated event in root' );
                error_log( 'WPGraphQL-SSE: Event data type: ' . ( is_object( $event_data ) ? get_class( $event_data ) : gettype( $event_data ) ) );
                error_log( 'WPGraphQL-SSE: Event data keys: ' . ( is_array( $event_data ) ? implode( ', ', array_keys( $event_data ) ) : 'not array' ) );
                
                // Extract post data from the standardized event format
                $post_data = null;
                if ( is_array( $event_data ) && isset( $event_data['context']['post'] ) ) {
                    // New event format: { node_type, action, node_id, context: { post: WP_Post } }
                    $post_data = $event_data['context']['post'];
                    error_log( 'WPGraphQL-SSE: Using post data from event.context.post' );
                } elseif ( is_array( $event_data ) && isset( $event_data['post'] ) ) {
                    // Legacy event format: { id, action, timestamp, post: { ... }, post_type }
                    $post_data = $event_data['post'];
                    error_log( 'WPGraphQL-SSE: Using post data from event.post' );
                } elseif ( is_array( $event_data ) && isset( $event_data['ID'] ) ) {
                    // Direct post data format
                    $post_data = $event_data;
                    error_log( 'WPGraphQL-SSE: Using event data directly as post data' );
                } elseif ( is_object( $event_data ) && isset( $event_data->ID ) ) {
                    // WP_Post object directly
                    $post_data = $event_data;
                    error_log( 'WPGraphQL-SSE: Using WP_Post object directly' );
                }
                
                if ( $post_data ) {
                    // Convert array to WP_Post object if needed
                    if ( is_array( $post_data ) && isset( $post_data['ID'] ) ) {
                        $post = get_post( $post_data['ID'] );
                        if ( $post && ! is_wp_error( $post ) ) {
                            $post_data = $post;
                        }
                    }
                    
                    // If we have a WP_Post object, check if it matches the requested ID
                    if ( is_object( $post_data ) && isset( $post_data->ID ) ) {
                        error_log( "WPGraphQL-SSE: WP_Post object found, ID: {$post_data->ID}" );
                        
                        // Filter: only return if this post matches the subscribed ID
                        if ( $requested_id && $post_data->ID != $requested_id ) {
                            error_log( "WPGraphQL-SSE: Post ID {$post_data->ID} does not match requested ID {$requested_id}, filtering out" );
                            return null;
                        }
                        
                        error_log( "WPGraphQL-SSE: Post ID matches, returning WPGraphQL Model" );
                        return new \WPGraphQL\Model\Post( $post_data );
                    }
                }
                
                error_log( 'WPGraphQL-SSE: Event data found but could not extract valid post data' );
            } else {
                error_log( 'WPGraphQL-SSE: No postUpdated event data found in root' );
            }
            
            // For initial subscription setup, return null
            error_log( 'WPGraphQL-SSE: Returning null from resolver' );
            return null;
        }
    ]);

    register_graphql_field( 'RootSubscription', 'commentAdded', [
        'description' => __( 'Subscription for new comments on a specific node (post, page, custom post type, etc).', 'wpgraphql-subscriptions' ),
        'type'        => 'Comment',
        'args'        => [
            'nodeId' => [
                'type'        => 'ID',
                'description' => __( 'The ID of the node to subscribe to comments for.', 'wpgraphql-subscriptions' ),
            ],
        ],
        'resolve' => function( $root, $args, $context, $info ) {
            // This resolver is called when the subscription is executed
            // For subscriptions, the actual data comes from the SSE stream events
            
            // Debug logging
            error_log( 'WPGraphQL-SSE: commentAdded resolver called' );
            error_log( 'WPGraphQL-SSE: Args: ' . json_encode( $args ) );
            error_log( 'WPGraphQL-SSE: Root type: ' . gettype( $root ) );
            if ( is_array( $root ) ) {
                error_log( 'WPGraphQL-SSE: Root keys: ' . implode( ', ', array_keys( $root ) ) );
            }
            
            // Get the requested node ID from subscription arguments
            $requested_node_id = isset( $args['nodeId'] ) ? absint( $args['nodeId'] ) : null;
            error_log( "WPGraphQL-SSE: Requested node ID: {$requested_node_id}" );
            
            // If we have event data from the subscription, extract the comment data
            if ( isset( $root['commentAdded'] ) ) {
                $event_data = $root['commentAdded'];
                error_log( 'WPGraphQL-SSE: Found commentAdded event in root' );
                error_log( 'WPGraphQL-SSE: Event data type: ' . ( is_object( $event_data ) ? get_class( $event_data ) : gettype( $event_data ) ) );
                error_log( 'WPGraphQL-SSE: Full event data: ' . json_encode( $event_data, JSON_PRETTY_PRINT ) );
                
                // Extract comment data from the standardized event format
                $comment_data = null;
                if ( is_array( $event_data ) && isset( $event_data['context']['comment'] ) ) {
                    // New event format: { node_type, action, node_id, context: { comment: WP_Comment } }
                    $comment_data = $event_data['context']['comment'];
                    error_log( 'WPGraphQL-SSE: Using comment data from event.context.comment' );
                } elseif ( is_array( $event_data ) && isset( $event_data['comment'] ) ) {
                    // Legacy event format: { id, action, timestamp, comment: { ... } }
                    $comment_data = $event_data['comment'];
                    error_log( 'WPGraphQL-SSE: Using comment data from event.comment' );
                } elseif ( is_array( $event_data ) && isset( $event_data['comment_ID'] ) ) {
                    // Direct comment data format
                    $comment_data = $event_data;
                    error_log( 'WPGraphQL-SSE: Using event data directly as comment data' );
                } elseif ( is_object( $event_data ) && isset( $event_data->comment_ID ) ) {
                    // WP_Comment object directly
                    $comment_data = $event_data;
                    error_log( 'WPGraphQL-SSE: Using WP_Comment object directly' );
                }
                
                if ( $comment_data ) {
                    // Convert array to WP_Comment object if needed
                    if ( is_array( $comment_data ) && isset( $comment_data['comment_ID'] ) ) {
                        $comment = get_comment( $comment_data['comment_ID'] );
                        if ( $comment && ! is_wp_error( $comment ) ) {
                            $comment_data = $comment;
                        }
                    }
                    
                    // If we have a WP_Comment object, check if it matches the requested node ID
                    if ( is_object( $comment_data ) && isset( $comment_data->comment_ID ) ) {
                        error_log( "WPGraphQL-SSE: WP_Comment object found, ID: {$comment_data->comment_ID}, Node ID: {$comment_data->comment_post_ID}" );
                        error_log( "WPGraphQL-SSE: Comment status: {$comment_data->comment_approved}, Content: " . substr( $comment_data->comment_content, 0, 100 ) );
                        error_log( "WPGraphQL-SSE: Comment author: {$comment_data->comment_author}, Email: {$comment_data->comment_author_email}" );
                        
                        // Filter: only return if this comment is for the subscribed node
                        // Use post_id from event context if available, otherwise fall back to comment object
                        $comment_post_id = $comment_data->comment_post_ID;
                        if ( isset( $event_data['context']['post_id'] ) ) {
                            $comment_post_id = $event_data['context']['post_id'];
                            error_log( "WPGraphQL-SSE: Using post_id from event context: {$comment_post_id}" );
                        }
                        
                        if ( $requested_node_id && $comment_post_id != $requested_node_id ) {
                            error_log( "WPGraphQL-SSE: Comment post ID {$comment_post_id} does not match requested node ID {$requested_node_id}, filtering out" );
                            return null;
                        }
                        
                        error_log( "WPGraphQL-SSE: Comment post ID matches, creating WPGraphQL Comment Model" );
                        
                        // Let WPGraphQL Model handle permissions - it will return null if user can't see this comment
                        $comment_model = new \WPGraphQL\Model\Comment( $comment_data );
                        
                        if ( $comment_model ) {
                            error_log( "WPGraphQL-SSE: Comment Model created successfully - user has permission to see comment" );
                            return $comment_model;
                        } else {
                            error_log( "WPGraphQL-SSE: Comment Model returned null - user does not have permission to see comment" );
                            return null;
                        }
                    }
                }
                
                error_log( 'WPGraphQL-SSE: Event data found but could not extract valid comment data' );
            } else {
                error_log( 'WPGraphQL-SSE: No commentAdded event data found in root' );
            }
            
            // For initial subscription setup, return null
            error_log( 'WPGraphQL-SSE: Returning null from resolver' );
            return null;
        }
    ]);
});

/**
 * Add the Subscription type to the schema.
 */
add_filter( 'graphql_schema_config', function( $config, $type_registry ) {
    $subscription_root = $type_registry->get_type( 'RootSubscription' );
    if ( $subscription_root ) {
        $config->setSubscription( $subscription_root );
    }
    return $config;
}, 10, 2 );