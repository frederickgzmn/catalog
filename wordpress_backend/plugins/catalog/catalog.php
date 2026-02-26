<?php
/**
 * Plugin Name: Catalog App
 * Plugin URI:  https://github.com/your-repo/wordpress_headless
 * Description: Headless CMS Catalog – custom post type, custom fields, and WPGraphQL integration with server‑side pricing.
 * Version:     1.1.0
 * Author:      Frederic Guzman Santana
 * Text Domain: fgs-catalog
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Main Catalog plugin class.
 *
 * Registers the catalog_item CPT, admin meta boxes, WPGraphQL schema extensions,
 * query filtering, and real-time subscription events.
 *
 * @since 1.1.0
 */
class FGS_Catalog_Plugin {

    /**
     * Post type identifier.
     *
     * @var string
     */
    const POST_TYPE = 'catalog_item';

    /**
     * Nonce action used for meta-box saves.
     *
     * @var string
     */
    const NONCE_ACTION = 'catalog_save_meta';

    /**
     * Nonce field name in the admin form.
     *
     * @var string
     */
    const NONCE_NAME = 'catalog_meta_nonce';

    /**
     * Mapping of form input names to post-meta keys.
     *
     * @var array<string, string>
     */
    const META_FIELD_MAP = [
        'catalog_price_a'    => '_price_a',
        'catalog_price_b'    => '_price_b',
        'catalog_card_set'   => '_card_set',
        'catalog_badge'      => '_badge',
        'catalog_category'   => '_catalog_category',
        'catalog_attributes' => '_catalog_attributes',
    ];

    /**
     * Allowed display-mapping presets.
     *
     * @var string[]
     */
    const DISPLAY_PRESETS = [ 'default', 'price_first', 'specs_first' ];

    /**
     * Default display-mapping values.
     *
     * @var array<string, mixed>
     */
    const DISPLAY_DEFAULTS = [
        'preset'           => 'default',
        'header'           => 'title',
        'subtitle'         => '',
        'badges'           => '',
        'show_price'       => true,
        'show_image'       => true,
        'show_description' => true,
    ];

    /**
     * Singleton instance.
     *
     * @var self|null
     */
    private static ?self $instance = null;

    /**
     * Return the singleton, creating it on first call.
     *
     * @return self
     */
    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Wire up all WordPress hooks.
     */
    private function __construct() {
        // CORS
        add_action( 'init', [ $this, 'handle_cors' ], 1 );

        // CPT
        add_action( 'init', [ $this, 'register_post_type' ] );

        // Admin meta box
        add_action( 'add_meta_boxes', [ $this, 'add_meta_boxes' ] );
        add_action( 'save_post_' . self::POST_TYPE, [ $this, 'save_meta' ] );

        // WPGraphQL schema
        add_action( 'graphql_register_types', [ $this, 'register_graphql_fields' ] );
        add_action( 'graphql_register_types', [ $this, 'register_graphql_where_args' ] );
        add_action( 'graphql_register_types', [ $this, 'register_subscriptions' ] );

        // WPGraphQL query filters
        add_filter( 'graphql_post_object_connection_query_args', [ $this, 'filter_connection_query_args' ], 10, 5 );
        add_filter( 'graphql_map_input_fields_to_wp_query', [ $this, 'map_input_fields_to_wp_query' ], 10, 7 );

        // Subscription events
        add_filter( 'wpgraphql_subscription_event_map', [ $this, 'register_event_map' ] );
        add_action( 'save_post_' . self::POST_TYPE, [ $this, 'emit_save_event' ], 20, 3 );
        add_action( 'before_delete_post', [ $this, 'emit_delete_event' ], 10, 2 );
    }

    /**
     * Prevent cloning.
     */
    private function __clone() {}

    /**
     * Prevent unserialization.
     *
     * @throws \RuntimeException Always.
     */
    public function __wakeup() {
        throw new \RuntimeException( 'Cannot unserialize singleton.' );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * We dont need https://github.com/funkhaus/wp-graphql-cors for now. But it is possible.
     * A custom CORS header wiill be good enough
     * Send CORS headers for /graphql endpoints.
     *
     * @return void
     */
    public function handle_cors(): void {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        if ( strpos( $uri, '/graphql' ) === false ) {
            return;
        }

        header( 'Access-Control-Allow-Origin: *' );
        header( 'Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS' );
        header( 'Access-Control-Allow-Headers: Content-Type, Authorization, X-GraphQL-Event-Stream-Token' );
        header( 'Access-Control-Allow-Credentials: true' );

        if ( 'OPTIONS' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
            header( 'Access-Control-Max-Age: 86400' );
            status_header( 200 );
            exit;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Custom Post Type
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register the catalog_item custom post type.
     *
     * @return void
     */
    public function register_post_type(): void {
        $labels = [
            'name'               => __( 'Catalog Items', 'catalog' ),
            'singular_name'      => __( 'Catalog Item', 'catalog' ),
            'add_new'            => __( 'Add New Item', 'catalog' ),
            'add_new_item'       => __( 'Add New Catalog Item', 'catalog' ),
            'edit_item'          => __( 'Edit Catalog Item', 'catalog' ),
            'all_items'          => __( 'All Catalog Items', 'catalog' ),
            'search_items'       => __( 'Search Catalog Items', 'catalog' ),
            'not_found'          => __( 'No catalog items found.', 'catalog' ),
        ];

        register_post_type( self::POST_TYPE, [
            'labels'              => $labels,
            'public'              => true,
            'show_in_graphql'     => true,
            'graphql_single_name' => 'catalogItem',
            'graphql_plural_name' => 'catalogItems',
            'supports'            => [ 'title', 'editor', 'thumbnail' ],
            'menu_icon'           => 'dashicons-grid-view',
            'has_archive'         => false,
            'rewrite'             => [ 'slug' => 'catalog' ],
        ] );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin Meta Box
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register the meta box on the catalog_item edit screen.
     *
     * @return void
     */
    public function add_meta_boxes(): void {
        add_meta_box(
            'catalog_item_details',
            __( 'Catalog Item Details', 'catalog' ),
            [ $this, 'render_meta_box' ],
            self::POST_TYPE,
            'normal',
            'high'
        );
    }

    /**
     * Output the meta-box HTML.
     *
     * @param \WP_Post $post Current post object.
     * @return void
     */
    public function render_meta_box( \WP_Post $post ): void {
        $price_a    = get_post_meta( $post->ID, '_price_a', true );
        $price_b    = get_post_meta( $post->ID, '_price_b', true );
        $card_set   = get_post_meta( $post->ID, '_card_set', true );
        $badge      = get_post_meta( $post->ID, '_badge', true );
        $category   = get_post_meta( $post->ID, '_catalog_category', true );
        $attributes = get_post_meta( $post->ID, '_catalog_attributes', true );

        $raw_dm = get_post_meta( $post->ID, '_display_mapping', true );
        $dm     = is_string( $raw_dm ) ? json_decode( $raw_dm, true ) : [];
        if ( ! is_array( $dm ) ) {
            $dm = [];
        }
        $dm = wp_parse_args( $dm, self::DISPLAY_DEFAULTS );

        wp_nonce_field( self::NONCE_ACTION, self::NONCE_NAME );
        require plugin_dir_path( __FILE__ ) . 'template/settings_form.php';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Save Meta Fields
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Persist meta-box data on save.
     *
     * @param int $post_id Post ID.
     * @return void
     */
    public function save_meta( int $post_id ): void {
        if ( ! isset( $_POST[ self::NONCE_NAME ] ) ) {
            return;
        }
        if ( ! wp_verify_nonce( $_POST[ self::NONCE_NAME ], self::NONCE_ACTION ) ) {
            return;
        }
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
            return;
        }
        if ( ! current_user_can( 'edit_post', $post_id ) ) {
            return;
        }

        foreach ( self::META_FIELD_MAP as $input => $meta_key ) {
            if ( ! isset( $_POST[ $input ] ) ) {
                continue;
            }
            $value = ( 'catalog_attributes' === $input )
                ? wp_kses_post( $_POST[ $input ] )
                : sanitize_text_field( $_POST[ $input ] );

            update_post_meta( $post_id, $meta_key, $value );
        }

        // Build display mapping JSON from structured fields.
        $dm = [
            'preset' => in_array( $_POST['dm_preset'] ?? '', self::DISPLAY_PRESETS, true )
            ? sanitize_text_field( $_POST['dm_preset'] ) : 'default',
            'header'           => sanitize_text_field( $_POST['dm_header']   ?? 'title' ),
            'subtitle'         => sanitize_text_field( $_POST['dm_subtitle'] ?? '' ),
            'badges'           => sanitize_text_field( $_POST['dm_badges']   ?? '' ),
            'show_price'       => ! empty( $_POST['dm_show_price'] ),
            'show_image'       => ! empty( $_POST['dm_show_image'] ),
            'show_description' => ! empty( $_POST['dm_show_description'] ),
        ];

        update_post_meta( $post_id, '_display_mapping', wp_json_encode( $dm ) );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WPGraphQL – Schema Extensions
    // ─────────────────────────────────────────────────────────────────────────
    #region WPGraphQL Schema Extensions

    /**
     * Register custom GraphQL fields on CatalogItem.
     *
     * @return void
     */
    public function register_graphql_fields(): void {
        if ( ! function_exists( 'register_graphql_field' ) ) {
            return;
        }

        // Price (audience-aware)
        register_graphql_field( 'CatalogItem', 'price', [
            'type'        => 'String',
            'description' => __( 'Correct price for the current viewer (guest vs. member).', 'catalog' ),
            'resolve'     => static function ( $post ) {
                $user = wp_get_current_user();
                if ( $user instanceof \WP_User && $user->ID > 0 ) {
                    $member_price = get_post_meta( $post->databaseId, '_price_b', true );
                    return '' !== $member_price ? $member_price : get_post_meta( $post->databaseId, '_price_a', true );
                }
                return get_post_meta( $post->databaseId, '_price_a', true );
            },
        ] );

        // Card Set
        register_graphql_field( 'CatalogItem', 'cardSet', [
            'type'        => 'String',
            'description' => __( 'Which card set this item belongs to: A (public) or B (members).', 'catalog' ),
            'resolve'     => static function ( $post ): string {
                return get_post_meta( $post->databaseId, '_card_set', true ) ?: 'A';
            },
        ] );

        // Badge
        register_graphql_field( 'CatalogItem', 'badge', [
            'type'        => 'String',
            'description' => __( 'Optional badge/tag label.', 'catalog' ),
            'resolve'     => static function ( $post ) {
                return get_post_meta( $post->databaseId, '_badge', true );
            },
        ] );

        // Display Mapping (JSON)
        register_graphql_field( 'CatalogItem', 'displayMapping', [
            'type'        => 'String',
            'description' => __( 'JSON string controlling frontend card presentation.', 'catalog' ),
            'resolve'     => static function ( $post ) {
                return get_post_meta( $post->databaseId, '_display_mapping', true );
            },
        ] );

        // Category
        register_graphql_field( 'CatalogItem', 'itemCategory', [
            'type'        => 'String',
            'description' => __( 'Category label for this catalog item.', 'catalog' ),
            'resolve'     => static function ( $post ) {
                return get_post_meta( $post->databaseId, '_catalog_category', true );
            },
        ] );

        // Attributes (JSON)
        register_graphql_field( 'CatalogItem', 'itemAttributes', [
            'type'        => 'String',
            'description' => __( 'JSON key-value attributes/specs.', 'catalog' ),
            'resolve'     => static function ( $post ) {
                return get_post_meta( $post->databaseId, '_catalog_attributes', true );
            },
        ] );
    }

    /**
     * Register custom "where" arguments on the catalogItems connection.
     *
     * @return void
     */
    public function register_graphql_where_args(): void {
        if ( ! function_exists( 'register_graphql_field' ) ) {
            return;
        }

        register_graphql_field( 'RootQueryToCatalogItemConnectionWhereArgs', 'category', [
            'type'        => 'String',
            'description' => __( 'Filter by catalog category.', 'catalog' ),
        ] );

        register_graphql_field( 'RootQueryToCatalogItemConnectionWhereArgs', 'cardSet', [
            'type'        => 'String',
            'description' => __( 'Filter by card set (A or B).', 'catalog' ),
        ] );
    }

    #endregion WPGraphQL

    #region WPGraphQL – Query Filters

    // ─────────────────────────────────────────────────────────────────────────
    // WPGraphQL – Query Filters
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Map custom GraphQL input fields to WP_Query keys.
     *
     * Hooked to `graphql_map_input_fields_to_wp_query`.
     *
     * @param array<string, mixed> $query_args Mapped WP_Query args.
     * @param array<string, mixed> $where_args GraphQL "where" args.
     * @param mixed                $source     The query source.
     * @param array<string, mixed> $all_args   All GraphQL args.
     * @param mixed                $context    AppContext.
     * @param mixed                $info       ResolveInfo.
     * @param mixed                $post_type  Post type(s).
     * @return array<string, mixed>
     */
    public function map_input_fields_to_wp_query( array $query_args, array $where_args, $source, array $all_args, $context, $info, $post_type ): array {
        if ( ! empty( $where_args['category'] ) ) {
            $query_args['catalog_category_filter'] = $where_args['category'];
        }
        if ( ! empty( $where_args['cardSet'] ) ) {
            $query_args['catalog_card_set_filter'] = $where_args['cardSet'];
        }
        return $query_args;
    }

    /**
     * Apply card-set restrictions and category filtering to the WP_Query args.
     *
     * - Guests cannot access Set B; their requests are silently forced to Set A.
     * - When no cardSet is specified, guests are restricted to Set A.
     * - Category meta filtering is applied when the argument is provided.
     *
     * Hooked to `graphql_post_object_connection_query_args`.
     *
     * @param array<string, mixed> $query_args WP_Query args.
     * @param mixed                $source     The source object.
     * @param array<string, mixed> $args       GraphQL field args.
     * @param mixed                $context    AppContext.
     * @param mixed                $info       ResolveInfo.
     * @return array<string, mixed>
     */
    public function filter_connection_query_args( array $query_args, $source, array $args = [], $context = null, $info = null ): array {
        if ( ! $this->is_catalog_query( $query_args ) ) {
            return $query_args;
        }

        $is_guest   = ! $this->is_authenticated();
        $meta_query = $query_args['meta_query'] ?? [];

        // ── Resolve the requested cardSet ──────────────────────────────────
        $set_val = $this->resolve_where_arg( $query_args, 'cardSet', 'catalog_card_set_filter' );

        // Guests are never allowed to query Set B — force to A.
        if ( $is_guest && 'B' === $set_val ) {
            $set_val = 'A';
        }

        // ── Apply cardSet filter ───────────────────────────────────────────
        if ( '' !== $set_val ) {
            $meta_query[] = $this->build_card_set_meta_clause( $set_val );
        } elseif ( $is_guest ) {
            // No specific cardSet requested + guest → restrict to Set A only.
            $meta_query[] = $this->build_card_set_meta_clause( 'A' );
        }

        // ── Category filter ────────────────────────────────────────────────
        $cat_val = $this->resolve_where_arg( $query_args, 'category', 'catalog_category_filter' );
        if ( '' !== $cat_val ) {
            $meta_query[] = [
                'key'     => '_catalog_category',
                'value'   => $cat_val,
                'compare' => '=',
            ];
        }

        // ── Finalize meta_query ────────────────────────────────────────────
        if ( ! empty( $meta_query ) ) {
            $clause_count = count( array_filter( array_keys( $meta_query ), 'is_int' ) );
            if ( $clause_count > 1 && empty( $meta_query['relation'] ) ) {
                $meta_query['relation'] = 'AND';
            }
            $query_args['meta_query'] = $meta_query;
        }

        return $query_args;
    }

    #endregion WPGraphQL – Query Filters
    
    #region WPGraphQL Subscriptions

    // ─────────────────────────────────────────────────────────────────────────
    // WPGraphQL Subscriptions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register the catalogItemUpdated subscription.
     *
     * @return void
     */
    public function register_subscriptions(): void {
        if ( ! function_exists( 'register_graphql_subscription' ) ) {
            return;
        }

        register_graphql_subscription( 'catalogItemUpdated', [
            'description'     => __( 'Subscription for catalog item create/update/delete events.', 'catalog' ),
            'type'            => 'CatalogItem',
            'args'            => [
                'id' => [
                    'type'        => 'ID',
                    'description' => __( 'Optional: subscribe to a specific catalog item by database ID.', 'catalog' ),
                ],
            ],
            'data_extractors' => [
                [ 'WPGraphQL_Subscription_Data_Extractors', 'extract_post_data' ],
            ],
            'filter_callback' => static function ( $post_model, $args ): bool {
                if ( $post_model->post_type !== self::POST_TYPE ) {
                    return false;
                }
                if ( isset( $args['id'] ) && $post_model->ID !== absint( $args['id'] ) ) {
                    return false;
                }
                return true;
            },
        ] );
    }

    /**
     * Register catalog_item in the subscription event map.
     *
     * @param array<string, array<string, string>> $event_map Existing map.
     * @return array<string, array<string, string>>
     */
    public function register_event_map( array $event_map ): array {
        $event_map[ self::POST_TYPE ] = [
            'CREATE' => 'catalogItemUpdated',
            'UPDATE' => 'catalogItemUpdated',
            'DELETE' => 'catalogItemUpdated',
        ];
        return $event_map;
    }

    /**
     * Emit a subscription event on create / update.
     *
     * Fires at priority 20 so meta has already been saved.
     *
     * @param int      $post_id Post ID.
     * @param \WP_Post $post    Post object.
     * @param bool     $update  Whether this is an update (true) or insert (false).
     * @return void
     */
    public function emit_save_event( int $post_id, \WP_Post $post, bool $update ): void {
        if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
            return;
        }
        if ( 'auto-draft' === $post->post_status ) {
            return;
        }

        $this->emit_event( $update ? 'UPDATE' : 'CREATE', $post_id, $post, 'save_post_' . self::POST_TYPE );
    }

    /**
     * Emit a subscription event just before a catalog_item is deleted.
     *
     * @param int      $post_id Post ID.
     * @param \WP_Post $post    Post object.
     * @return void
     */
    public function emit_delete_event( int $post_id, \WP_Post $post ): void {
        if ( self::POST_TYPE !== $post->post_type ) {
            return;
        }

        $this->emit_event( 'DELETE', $post_id, $post, 'before_delete_post' );
    }

    #endregion WPGraphQL Subscriptions

    #region Private Helpers
    // ─────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Whether the current WP_Query targets catalog_item.
     *
     * WPGraphQL wraps the post type in an array, so we normalise before checking.
     *
     * @param array<string, mixed> $query_args WP_Query args.
     * @return bool
     */
    private function is_catalog_query( array $query_args ): bool {
        $pt    = $query_args['post_type'] ?? '';
        $types = is_array( $pt ) ? $pt : [ $pt ];
        return in_array( self::POST_TYPE, $types, true );
    }

    /**
     * Whether the current request is authenticated (not a guest).
     *
     * @return bool
     */
    private function is_authenticated(): bool {
        $user = wp_get_current_user();
        return $user instanceof \WP_User && $user->ID > 0;
    }

    /**
     * Resolve a where-arg value from graphql_args or the mapped custom key.
     *
     * @param array<string, mixed> $query_args WP_Query args.
     * @param string               $gql_key    Key inside graphql_args['where'].
     * @param string               $mapped_key Custom key set by map_input_fields_to_wp_query.
     * @return string The resolved value, or empty string.
     */
    private function resolve_where_arg( array $query_args, string $gql_key, string $mapped_key ): string {
        if ( ! empty( $query_args['graphql_args']['where'][ $gql_key ] ) ) {
            return (string) $query_args['graphql_args']['where'][ $gql_key ];
        }
        if ( ! empty( $query_args[ $mapped_key ] ) ) {
            return (string) $query_args[ $mapped_key ];
        }
        return '';
    }

    /**
     * Build the meta_query clause for card-set filtering.
     *
     * Set A includes items explicitly marked 'A' *or* items with no _card_set meta.
     * All other sets use an exact match.
     *
     * @param string $set_val The requested set value (e.g. 'A' or 'B').
     * @return array<string, mixed>
     */
    private function build_card_set_meta_clause( string $set_val ): array {
        if ( 'A' === $set_val ) {
            return [
                'relation' => 'OR',
                [
                    'key'     => '_card_set',
                    'value'   => 'A',
                    'compare' => '=',
                ],
                [
                    'key'     => '_card_set',
                    'compare' => 'NOT EXISTS',
                ],
            ];
        }

        return [
            'key'     => '_card_set',
            'value'   => $set_val,
            'compare' => '=',
        ];
    }

    /**
     * Emit a WPGraphQL subscription event if the emitter class is available.
     *
     * @param string   $action  CREATE | UPDATE | DELETE.
     * @param int      $post_id Post ID.
     * @param \WP_Post $post    Post object.
     * @param string   $hook    The originating WordPress hook name.
     * @return void
     */
    private function emit_event( string $action, int $post_id, \WP_Post $post, string $hook ): void {
        if ( ! class_exists( 'WPGraphQL_Event_Emitter' ) ) {
            return;
        }

        \WPGraphQL_Event_Emitter::emit(
            self::POST_TYPE,
            $action,
            $post_id,
            [
                'post'      => $post,
                'post_type' => self::POST_TYPE,
            ],
            [
                'hook'   => $hook,
                'plugin' => 'catalog',
            ]
        );
    }
}

// Initialise the plugin.
FGS_Catalog_Plugin::get_instance();
