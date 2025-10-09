# Payload Express Middleware

`payload-express-middleware` is a library that enables API routing in Express.js, similar to Next.js API routes, using [Payload CMS](https://payloadcms.com). This middleware simplifies the process of integrating Payload's Local API with an Express.js application.

## Features

- Seamlessly map API routes to Payload CMS collections.
- Built-in authentication and authorization middleware.
- CRUD operations for Payload collections.
- Error handling for common Payload validation and authentication errors.

## Installation

Install the library and its peer dependencies:

NPM

```bash
npm install payload-express-middleware payload express
```

Yarn

```bash
yarn add payload-express-middleware payload express
```

## Usage

### 1. Initialize Payload CMS

Ensure you have a Payload CMS configuration file (e.g., `payload.config.js`) and initialize Payload in your Express app.

### 2. Use the Middleware

Import and use the `payloadAPIRouterMiddleware` function in your Express app:

```typescript
import express from "express";
import payload from "payload";
import { payloadAPIRouterMiddleware } from "payload-express-middleware";
import path from "path";

const app = express();

async function start() {
  // Load Payload configuration
  const config = path.resolve(__dirname, "/route/to/payload.config.js");

  // Initialize Payload
  await payload.init({
    secret: "PAYLOAD_SECRET", // Replace with your Payload secret
    config,
  });

  // Use the middleware
  app.use(payloadAPIRouterMiddleware(payload));

  // Use your other middleware, routes, etc
  // ....

  // Start the server
  app.listen(4000, () => {
    console.log("Express API running on port 4000");
  });
}

start();
```

### 3. API Routes

The middleware automatically maps the following routes to Payload's Local API:

#### Authentication Routes

- **Login**: `POST /api/users-collection}/login`
- **Logout**: `POST /api/{users-collection}/logout`
- **Me**: `GET /api/{users-collection}/me`

Note: `{user-collection}` defined by your `payload.config.js`

#### CRUD Routes

- **Find Many**: `GET /api/:collection`
- **Find By ID**: `GET /api/:collection/:id`
- **Create**: `POST /api/:collection`
- **Update**: `PATCH /api/:collection/:id`
- **Delete**: `DELETE /api/:collection/:id`

### 4. Example Payload Configuration

Ensure your Payload CMS configuration file (`payload.config.js`) is properly set up. For example:

```javascript
module.exports = {
  secret: "MY_SECRET",
  collections: [
    {
      slug: "users",
      admin: true, // --> enables 'user-collection' for Auth operations
      fields: [
        { name: "email", type: "email", required: true },
        { name: "password", type: "password", required: true },
      ],
    },
    {
      slug: "posts",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "content", type: "richText" },
      ],
    },
  ],
};
```

## API Documentation

### `payloadAPIRouterMiddleware(payload: Payload)`

This function creates an Express router that maps API routes to Payload's Local API.

#### Parameters

- `payload`: The initialized Payload CMS instance.

## Error Handling

The middleware includes built-in error handling for:

- Validation errors (`400 Bad Request`).
- Authentication errors (`401 Unauthorized`).
- Not found errors (`404 Not Found`).
- Generic server errors (`500 Internal Server Error`).

## License

This project is licensed under the [MIT License](LICENSE).
