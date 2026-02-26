Backend:
WordPress Plugins: WPGraphQL(https://wordpress.org/plugins/wp-graphql/), WPGraphQL Subscriptions(https://github.com/wp-graphql/wp-graphql-subscriptions), and WPGraphQL JWT Authentication(https://github.com/wp-graphql/wp-graphql-jwt-authentication)
    Wordpress settings: 1 custom post type with 

frontend:
jquery, bootstrap css, gulp

Development:
    Docker composer with 4 containers: wordpress, mysql, phpmyadmin and redis(for cache)
    File: docker-compose.yaml
    Config needed:
        define( 'GRAPHQL_JWT_AUTH_SECRET_KEY', 'your-secret-token' );

Overview:
Build and deploy a small full‑stack “Catalog” app. Wordpress headless CMS that has a free tier for developers. The app lists items and supports a custom “display mapping” that changes the frontend presentation. The UI should be clean, polished, and good-looking.

Card sets and visibility
- 2 sets of cards: A and B.
- Not logged in: show Set A only.
- Logged in: show Sets A and B.

Pricing must be determined server-side(wp-graphql). The correct price for the current audience must appear in the server-rendered output or initial API response, not only applied in the client.

Security: Only expose what is needed:

<IfModule mod_rewrite.c>
RewriteEngine On

# 1. Open the door for GraphQL
RewriteCond %{REQUEST_URI} ^/graphql [NC]
RewriteRule ^ - [L]

# 2. Open the door for Media Uploads
RewriteCond %{REQUEST_URI} ^/wp-content/uploads/ [NC]
RewriteRule ^ - [L]

# 3. Keep the Admin Dashboard open ONLY for your IP address
# REPLACE 123.45.67.89 with your real IP address!
# RewriteCond %{REQUEST_URI} ^/wp-admin [NC,OR]
# RewriteCond %{REQUEST_URI} ^/wp-login\.php [NC]
# RewriteCond %{REMOTE_ADDR} !=123.45.67.89
# RewriteRule ^ - [F]

# 4. Redirect all other visitors to your new frontend website
RewriteCond %{REQUEST_URI} !^/graphql [NC]
RewriteCond %{REQUEST_URI} !^/wp-content/uploads/ [NC]
RewriteCond %{REQUEST_URI} !^/wp-admin [NC]
RewriteCond %{REQUEST_URI} !^/wp-login\.php [NC]
RewriteRule ^(.*)$ http://localhost:8080[R=301,L] # Hey!!! Web must be changed for production #fgs-production-note (tag for myself xD)

</IfModule>

Design:
    Frontend quality and visual design
    - Clean, good-looking UI: Clear layout, readable typography, consistent spacing, and a coherent visual style. The catalog should feel polished and intentional.

    Responsiveness
    - Mobile‑first; works well from 360px up to desktop, including tablet.

Tree directory:
    frontend/
    wordpress_backend/
    docker-compose.yaml
    readme.md