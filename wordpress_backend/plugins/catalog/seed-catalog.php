<?php
/**
 * Catalog Seeder — Creates 12 diverse catalog items via WP-CLI.
 *
 * Usage:  docker compose exec wordpress wp eval-file wp-content/plugins/catalog/seed-catalog.php
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit( 'Run via WP-CLI: wp eval-file wp-content/plugins/catalog/seed-catalog.php' );
}

$items = [
    // ── Set A – Public ──────────────────────────────────────────────────────
    [
        'title'      => 'Zenith Wireless Headphones',
        'content'    => 'Premium over-ear headphones with active noise cancellation, 40-hour battery life, and Hi-Res audio certification.',
        'card_set'   => 'A',
        'price_a'    => '149.99',
        'price_b'    => '119.99',
        'badge'      => 'New',
        'category'   => 'Electronics',
        'attributes' => [ 'color' => 'Matte Black', 'weight' => '254g', 'rating' => '4.8', 'driver' => '40mm' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => '', 'badges' => 'color, rating', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'Ember Running Shoes',
        'content'    => 'Lightweight mesh upper with responsive foam midsole. Designed for daily training and tempo runs.',
        'card_set'   => 'A',
        'price_a'    => '89.00',
        'price_b'    => '71.00',
        'badge'      => 'Hot',
        'category'   => 'Footwear',
        'attributes' => [ 'color' => 'Solar Red', 'size' => '10', 'rating' => '4.6', 'weight' => '230g' ],
        'dm'         => [ 'preset' => 'price_first', 'header' => 'title', 'subtitle' => 'price', 'badges' => 'color, size', 'show_price' => true, 'show_image' => true, 'show_description' => false ],
    ],
    [
        'title'      => 'ArcticBreeze Portable Fan',
        'content'    => 'USB-C rechargeable desk fan with 3 speeds and whisper-quiet operation. Perfect for hot desks.',
        'card_set'   => 'A',
        'price_a'    => '34.99',
        'price_b'    => '28.99',
        'badge'      => '',
        'category'   => 'Home & Office',
        'attributes' => [ 'color' => 'Cloud White', 'rating' => '4.3', 'battery' => '8h', 'noise' => '28dB' ],
        'dm'         => [ 'preset' => 'specs_first', 'header' => 'title', 'subtitle' => 'category', 'badges' => 'battery, noise', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'TerraSteel Water Bottle',
        'content'    => 'Double-wall vacuum insulated stainless steel. Keeps drinks cold for 24h or hot for 12h.',
        'card_set'   => 'A',
        'price_a'    => '24.50',
        'price_b'    => '19.50',
        'badge'      => 'Sale',
        'category'   => 'Outdoor',
        'attributes' => [ 'color' => 'Forest Green', 'size' => '750ml', 'rating' => '4.9', 'material' => 'Stainless Steel' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => '', 'badges' => 'size, material', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'LumiDesk LED Monitor Light',
        'content'    => 'Asymmetric light bar that illuminates your desk without screen glare. Adjustable colour temperature.',
        'card_set'   => 'A',
        'price_a'    => '59.00',
        'price_b'    => '47.00',
        'badge'      => '',
        'category'   => 'Electronics',
        'attributes' => [ 'color' => 'Space Grey', 'rating' => '4.7', 'wattage' => '5W', 'length' => '45cm' ],
        'dm'         => [ 'preset' => 'price_first', 'header' => 'title', 'subtitle' => 'price', 'badges' => 'wattage, rating', 'show_price' => true, 'show_image' => true, 'show_description' => false ],
    ],
    [
        'title'      => 'NovaPack Daypack 22L',
        'content'    => 'Water-resistant commuter backpack with padded laptop sleeve, quick-access pockets, and reflective accents.',
        'card_set'   => 'A',
        'price_a'    => '79.00',
        'price_b'    => '63.00',
        'badge'      => 'New',
        'category'   => 'Bags',
        'attributes' => [ 'color' => 'Midnight Navy', 'size' => '22L', 'rating' => '4.5', 'weight' => '680g' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => '', 'badges' => 'color, size', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],

    // ── Set B – Members only ─────────────────────────────────────────────────
    [
        'title'      => 'Obsidian Mechanical Keyboard',
        'content'    => 'Hot-swappable switches, per-key RGB, gasket-mount aluminium case. Built for enthusiasts.',
        'card_set'   => 'B',
        'price_a'    => '199.00',
        'price_b'    => '159.00',
        'badge'      => '',
        'category'   => 'Electronics',
        'attributes' => [ 'color' => 'Gunmetal', 'size' => '75%', 'rating' => '4.9', 'switch' => 'Linear' ],
        'dm'         => [ 'preset' => 'specs_first', 'header' => 'title', 'subtitle' => '', 'badges' => 'switch, size', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'Aurora Yoga Mat',
        'content'    => '6mm natural rubber mat with alignment markers. Non-slip surface on both sides.',
        'card_set'   => 'B',
        'price_a'    => '68.00',
        'price_b'    => '54.00',
        'badge'      => 'Hot',
        'category'   => 'Fitness',
        'attributes' => [ 'color' => 'Lavender', 'size' => '183×61cm', 'rating' => '4.7', 'thickness' => '6mm' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => '', 'badges' => 'color, thickness', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'Chrono Smart Watch Pro',
        'content'    => 'AMOLED display, 14-day battery, SpO2 and heart-rate monitoring. 5ATM water resistance.',
        'card_set'   => 'B',
        'price_a'    => '249.99',
        'price_b'    => '199.99',
        'badge'      => 'Sale',
        'category'   => 'Wearables',
        'attributes' => [ 'color' => 'Titanium Silver', 'size' => '46mm', 'rating' => '4.8', 'battery' => '14 days' ],
        'dm'         => [ 'preset' => 'price_first', 'header' => 'title', 'subtitle' => 'price', 'badges' => 'battery, rating', 'show_price' => true, 'show_image' => true, 'show_description' => false ],
    ],
    [
        'title'      => 'Pixton Polarised Sunglasses',
        'content'    => 'TR90 lightweight frame with scratch-resistant polarised lenses. UV400 protection.',
        'card_set'   => 'B',
        'price_a'    => '45.00',
        'price_b'    => '36.00',
        'badge'      => '',
        'category'   => 'Accessories',
        'attributes' => [ 'color' => 'Tortoise Shell', 'size' => 'Unisex', 'rating' => '4.4', 'lens' => 'Polarised' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => 'category', 'badges' => 'lens, color', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'CoreFlex Resistance Bands Set',
        'content'    => '5-band set (10–50 lb) with door anchor, ankle straps, and carry bag. Latex-free TPE material.',
        'card_set'   => 'A',
        'price_a'    => '29.99',
        'price_b'    => '24.99',
        'badge'      => '',
        'category'   => 'Fitness',
        'attributes' => [ 'color' => 'Multi-colour', 'rating' => '4.6', 'material' => 'TPE', 'pieces' => '5' ],
        'dm'         => [ 'preset' => 'specs_first', 'header' => 'title', 'subtitle' => '', 'badges' => 'pieces, material', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
    [
        'title'      => 'MistVeil Essential Oil Diffuser',
        'content'    => '300ml ultrasonic diffuser with 7-colour LED mood light and auto shut-off. Whisper-quiet operation.',
        'card_set'   => 'A',
        'price_a'    => '39.99',
        'price_b'    => '32.99',
        'badge'      => 'New',
        'category'   => 'Home & Office',
        'attributes' => [ 'color' => 'Bamboo', 'size' => '300ml', 'rating' => '4.5', 'runtime' => '10h' ],
        'dm'         => [ 'preset' => 'default', 'header' => 'title', 'subtitle' => '', 'badges' => 'runtime, rating', 'show_price' => true, 'show_image' => true, 'show_description' => true ],
    ],
];

$created = 0;

foreach ( $items as $item ) {
    // Skip if a post with the same title already exists
    $existing = get_page_by_title( $item['title'], OBJECT, 'catalog_item' );
    if ( $existing ) {
        WP_CLI::log( "⏭  Skipping \"{$item['title']}\" — already exists (ID {$existing->ID})" );
        continue;
    }

    $post_id = wp_insert_post( [
        'post_type'    => 'catalog_item',
        'post_title'   => $item['title'],
        'post_content' => $item['content'],
        'post_status'  => 'publish',
    ] );

    if ( is_wp_error( $post_id ) ) {
        WP_CLI::warning( "Failed to create \"{$item['title']}\": " . $post_id->get_error_message() );
        continue;
    }

    update_post_meta( $post_id, '_card_set',           $item['card_set'] );
    update_post_meta( $post_id, '_price_a',            $item['price_a'] );
    update_post_meta( $post_id, '_price_b',            $item['price_b'] );
    update_post_meta( $post_id, '_badge',              $item['badge'] );
    update_post_meta( $post_id, '_catalog_category',   $item['category'] );
    update_post_meta( $post_id, '_catalog_attributes', wp_json_encode( $item['attributes'] ) );
    update_post_meta( $post_id, '_display_mapping',    wp_json_encode( $item['dm'] ) );

    $set_label = $item['card_set'] === 'B' ? 'Set B' : 'Set A';
    WP_CLI::success( "Created \"{$item['title']}\" (ID {$post_id}) — {$set_label}, {$item['category']}, preset: {$item['dm']['preset']}" );
    $created++;
}

WP_CLI::log( '' );
WP_CLI::success( "Done! Created {$created} catalog items." );
