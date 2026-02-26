<?php
// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
?>
<table class="form-table">
    <tr>
        <th><label for="catalog_card_set"><?php esc_html_e( 'Card Set', 'catalog' ); ?></label></th>
        <td>
            <select id="catalog_card_set" name="catalog_card_set">
                <option value="A" <?php selected( $card_set, 'A' ); ?>>Set A – Public</option>
                <option value="B" <?php selected( $card_set, 'B' ); ?>>Set B – Members only</option>
            </select>
        </td>
    </tr>
    <tr>
        <th><label for="catalog_category"><?php esc_html_e( 'Category', 'catalog' ); ?></label></th>
        <td><input type="text" id="catalog_category" name="catalog_category" value="<?php echo esc_attr( $category ); ?>" class="regular-text" placeholder="e.g. Electronics, Apparel, Furniture" /></td>
    </tr>
    <tr>
        <th><label for="catalog_price_a"><?php esc_html_e( 'Price A (Public / Guest)', 'catalog' ); ?></label></th>
        <td><input type="text" id="catalog_price_a" name="catalog_price_a" value="<?php echo esc_attr( $price_a ); ?>" class="regular-text" placeholder="e.g. 9.99" /></td>
    </tr>
    <tr>
        <th><label for="catalog_price_b"><?php esc_html_e( 'Price B (Member)', 'catalog' ); ?></label></th>
        <td><input type="text" id="catalog_price_b" name="catalog_price_b" value="<?php echo esc_attr( $price_b ); ?>" class="regular-text" placeholder="e.g. 7.99" /></td>
    </tr>
    <tr>
        <th><label for="catalog_badge"><?php esc_html_e( 'Badge / Tag', 'catalog' ); ?></label></th>
        <td><input type="text" id="catalog_badge" name="catalog_badge" value="<?php echo esc_attr( $badge ); ?>" class="regular-text" placeholder="e.g. New, Hot, Sale" /></td>
    </tr>
    <tr>
        <th><label for="catalog_attributes"><?php esc_html_e( 'Attributes (JSON)', 'catalog' ); ?></label></th>
        <td>
            <textarea id="catalog_attributes" name="catalog_attributes" rows="4" class="large-text code"><?php echo esc_textarea( $attributes ); ?></textarea>
            <p class="description"><?php esc_html_e( 'JSON key→value pairs. Example: {"weight":"2.5kg","color":"Black","material":"Aluminum"}', 'catalog' ); ?></p>
        </td>
    </tr>
</table>

<h3 style="margin-top:1.5em;border-top:1px solid #ccd0d4;padding-top:1em;"><?php esc_html_e( 'Display Mapping', 'catalog' ); ?></h3>
<table class="form-table">
    <tr>
        <th><label for="dm_preset"><?php esc_html_e( 'Preset', 'catalog' ); ?></label></th>
        <td>
            <select id="dm_preset" name="dm_preset">
                <option value="default"     <?php selected( $dm['preset'], 'default' ); ?>><?php esc_html_e( 'Default', 'catalog' ); ?></option>
                <option value="price_first" <?php selected( $dm['preset'], 'price_first' ); ?>><?php esc_html_e( 'Price‑first', 'catalog' ); ?></option>
                <option value="specs_first" <?php selected( $dm['preset'], 'specs_first' ); ?>><?php esc_html_e( 'Specs‑first', 'catalog' ); ?></option>
            </select>
        </td>
    </tr>
    <tr>
        <th><label for="dm_header"><?php esc_html_e( 'Card Header', 'catalog' ); ?></label></th>
        <td>
            <input type="text" id="dm_header" name="dm_header" value="<?php echo esc_attr( $dm['header'] ); ?>" class="regular-text" />
            <p class="description"><?php _e( 'Field for the card heading. Usually <code>title</code>.', 'catalog' ); ?></p>
        </td>
    </tr>
    <tr>
        <th><label for="dm_subtitle"><?php esc_html_e( 'Subtitle', 'catalog' ); ?></label></th>
        <td>
            <input type="text" id="dm_subtitle" name="dm_subtitle" value="<?php echo esc_attr( $dm['subtitle'] ); ?>" class="regular-text" />
            <p class="description"><?php _e( 'Below the header. E.g. <code>price</code>, <code>category</code>, or leave blank.', 'catalog' ); ?></p>
        </td>
    </tr>
    <tr>
        <th><label for="dm_badges"><?php esc_html_e( 'Badge Attributes', 'catalog' ); ?></label></th>
        <td>
            <input type="text" id="dm_badges" name="dm_badges" value="<?php echo esc_attr( $dm['badges'] ); ?>" class="regular-text" />
            <p class="description"><?php _e( 'Comma-separated attribute keys shown as pill badges. E.g. <code>weight, color</code>.', 'catalog' ); ?></p>
        </td>
    </tr>
    <tr>
        <th><?php esc_html_e( 'Visibility', 'catalog' ); ?></th>
        <td>
            <label style="display:block;margin-bottom:4px;"><input type="checkbox" name="dm_show_price" value="1" <?php checked( $dm['show_price'] ); ?>> <?php esc_html_e( 'Show price', 'catalog' ); ?></label>
            <label style="display:block;margin-bottom:4px;"><input type="checkbox" name="dm_show_image" value="1" <?php checked( $dm['show_image'] ); ?>> <?php esc_html_e( 'Show image', 'catalog' ); ?></label>
            <label style="display:block;"><input type="checkbox" name="dm_show_description" value="1" <?php checked( $dm['show_description'] ); ?>> <?php esc_html_e( 'Show description', 'catalog' ); ?></label>
        </td>
    </tr>
</table>