/**
 * Express Middleware/Router for Payload Local API.
 *
 * This router mimics the functionality of a simple Next.js API router by intercepting
 * requests to /api/:collection, /api/:collection/:id, and auth endpoints.
 * All requests are mapped directly to the high-performance Payload Local API.
 *
 * It assumes the Payload instance is attached to the request object as `req.payload`.
 */

import * as core from "express-serve-static-core";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Payload } from "payload";
import { NextFunction, Request, Response, Router, Express } from "express";
import { parse } from "qs-esm";
import url from "url";

interface PayloadRequestQuery extends core.Query {}
interface PayloadRequest
  extends Request<core.ParamsDictionary, any, any, PayloadRequestQuery> {
  user: any; // Payload user's data
}

type PayloadAPIRouterMiddlewareOptions = {
  simpleResponses: boolean;
};

export function payloadAPIRouterMiddleware(
  payload: Payload,
  options?: PayloadAPIRouterMiddlewareOptions,
) {
  const router = Router();

  /**
   * Helper function to handle async operations and catch errors consistently.
   * @param {function} fn - The asynchronous function to execute.
   */
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  const queryParser = (req: any, res: any, next: NextFunction) => {
    const parsedUrl = url.parse(req.url);
    const queryString = parsedUrl.query || "";

    console.log({ parsedUrl });
    console.log({ queryString });

    const parsedQuery = parse(queryString, {
      decoder(value: string) {
        if (!isNaN(Number(value))) return Number(value);
        if (value === "true") return true;
        if (value === "false") return false;
        return value;
      },
    });

    console.log({ parsedQuery });

    req.query = parsedQuery;

    next();
  };

  /**
   * Custom JWT Auth Middleware for Payload
   * Express middleware to manually set req.user from a Bearer Token.
   *
   * @param {object} req - Express request object (must have req.payload attached).
   * @param {object} res - Express response object.
   * @param {function} next - Express next middleware function.
   */
  async function payloadJwtAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    let authHeader: string = "";

    if (req && req.headers) {
      authHeader = req.headers["authorization"] as string;
    }

    // In production, this would come from process.env.PAYLOAD_SECRET
    const PAYLOAD_SECRET = payload.config ? payload.config.secret : "";

    // Check for PAYLOAD_SECRET, Payload instance, Authorization header, and Bearer prefix
    if (
      !PAYLOAD_SECRET ||
      !payload ||
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return next();
    }

    // Extract the token string
    const token = authHeader.split(" ")[1];

    if (!token) {
      return next();
    }

    try {
      // --- JWT Verification and Decoding ---
      const payloadVerificationSecret = crypto
        .createHash("sha256")
        .update(PAYLOAD_SECRET)
        .digest("hex")
        .slice(0, 32);

      const decoded = jwt.verify(token, payloadVerificationSecret) as any;
      const userId = decoded.id;

      if (!userId) {
        throw new Error("Token payload missing user ID.");
      }

      // --- Fetch the full User Document ---
      // Use the Local API to retrieve the user by ID.
      // We use overrideAccess: true because this is an internal auth flow,
      // and we need to fetch the user regardless of the collection's public 'read' access rules.
      const fullUserDocument = await payload.findByID({
        collection: "users", // Assumes 'users' is the slug for the authenticated collection
        id: userId,
        overrideAccess: true,
        //@ts-ignore
        req: req, // Pass req for Payload context
      });

      if (fullUserDocument) {
        // 3. Success! Attach the full user document to the request object
        // @ts-ignore
        req.user = fullUserDocument;
        console.log(
          `[JWT Middleware] Successfully authenticated user: ${fullUserDocument.id}`,
        );
      } else {
        // Token was valid, but the user was not found in the database (e.g., deleted account)
        console.log(
          `[JWT Middleware] Token was valid, but user ID ${userId} not found in DB.`,
        );
      }
    } catch (e: any) {
      // This catches errors from jwt.verify (expired, bad signature) or other failures.
      console.log(`[JWT Middleware] Authentication failed: ${e.message}`);
    }

    // Allow the request to continue to the next middleware/router
    next();
  }

  // Matches /api/anything and /api/anything/...
  router.all(
    /^\/(api|auth)\/([^\/]+)(\/.*)?$/,
    asyncHandler(async (req, res, next) => {
      const { customPath } = req.params;

      // try custom (API) endpoint
      const fullPath = req.path;

      console.log(`Proxying ...${fullPath} API endpoint`);

      const payloadCollections = Object.keys(payload.collections);
      if (payloadCollections.includes(customPath)) {
        return next();
      }
      try {
        const myEndpoint = payload.config.endpoints.find(
          (e) => e.path === fullPath,
        );
        if (!myEndpoint?.handler) {
          // return res.status(404).json({error: 'No exist!'})
          return next();
        }

        console.log(`myEndpoint.method=${myEndpoint.method}`);
        console.log(`req.method=${req.method}`);
        const headersObj = req.headers;
        // only call matched Method types
        if (myEndpoint.method.toUpperCase() !== req.method) {
          return next();
        }
        const payloadReq: PayloadRequest = {
          //@ts-ignore
          payload: payload,
          fallbackLocale: "en",
          context: {},
          payloadAPI: "REST",
          headers: {
            ...headersObj,
            get: (key: string) => {
              const val = headersObj[key.toLowerCase()];
              if (Array.isArray(val)) return val[0];
              return val || null;
            },
          },
          user: null,
          query: req.query,
          // body: {},
          routeParams: {},
          t: (key: string) => key, // dummy i18n function
          // @ts-ignore
          payloadDataLoader: {
            find: payload.find.bind(payload),
          },
        };
        //@ts-ignore
        const result = await myEndpoint.handler(payloadReq);
        if (result.status >= 300 && result.status < 400) {
          const location = result.headers.get("Location");
          console.log("Redirecting to:", location);
          return res.redirect(result.status, location);
        }
        console.log({ result });

        const data = await result.json();

        // Send the response back
        return res.status(result.status || 200).json(data);
      } catch (error: any) {
        // Handle errors from Payload
        const status = error.status || error.response?.status || 500;
        const message = error.data || error.message || "Internal server error";
        console.error({ error: message, status });
        // console.error(error);
        // return next("router");
        next("router");
      }
    }),
  );

  router.use(
    "/api/:collection/",
    (req: Request, res: Response, next: NextFunction) => {
      const { collection } = req.params;

      const payloadCollections = Object.keys(payload.collections);
      if (!payloadCollections.includes(collection)) {
        return next("router");
      }
      next();
    },
  );

  /**
   * Middleware to enforce authentication for mutation routes (POST, PATCH, DELETE).
   * This relies on Payload's session middleware having already populated req.user.
   */
  const isAuthenticated = (req, res, next) => {
    // req.user is populated by Payload's internal Express authentication middleware
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Payload: Authentication required to perform actions.",
      });
    }
    next();
  };

  // --- AUTHENTICATION ROUTES ---

  /**
   * 1. LOGIN (POST /api/:collection/login)
   * Maps to: payload.login({ collection, data, req, res })
   */
  router.post(
    "/api/:collection/login",
    asyncHandler(async (req, res) => {
      const { collection } = req.params;

      // Note: req and res MUST be passed for Payload to handle session cookies.
      const result = await payload.login({
        collection,
        data: req.body, // Expects { email, password }
        req,
        //@ts-ignore
        res,
      });

      // Payload handles status codes (usually 200 on success)
      return res.json(result);
    }),
  );

  /**
   * 2. LOGOUT (POST /api/:collection/logout)
   * Maps to: payload.logout({ collection, req, res })
   */
  router.post(
    "/api/:collection/logout",
    asyncHandler(async (req, res) => {
      const { collection } = req.params;

      // Note: req and res MUST be passed for Payload to clear session cookies.
      //@ts-ignore
      const result = await payload.logout({
        collection,
        req,
        res,
      });

      // Payload handles status codes (usually 200 on success)
      return res.json(result);
    }),
  );

  /**
   * 3. ME (GET /api/:collection/me)
   * Maps to: payload.me({ collection, req })
   * Returns the currently authenticated user document, or null.
   */
  router.get(
    "/api/:collection/me",
    payloadJwtAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { collection } = req.params;

      const { id } = req.user;

      // Note: req is required for Payload to check the session/auth status.
      const result = await payload.findByID({
        collection,
        id,
      });

      const data = { ...result };
      delete data["sessions"];

      // Payload handles status codes (usually 200 on success, or 401 if unauthorized)
      return res.json(data);
    }),
  );

  // --- CRUD ROUTES (COLLECTIONS) ---

  /**
   * 4. FIND MANY (GET /api/:collection)
   * Maps to: payload.find({ collection, where, limit, page, ... })
   * NOTE: req is passed to enforce Payload's 'read' access control.
   */
  router.get(
    "/api/:collection",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    queryParser,
    asyncHandler(async (req, res) => {
      const { collection } = req.params;
      const { query } = req;
      const result = await payload.find({
        collection,
        depth: query.depth ? parseInt(query.depth) : 0, // Default depth to 0 for performance
        req, // <--- IMPORTANT: Pass req to enforce Payload's access control (e.g., read: authenticated)
        ...query, // Pass all query params (limit, page, where, sort, etc.)
      });

      return res
        .status(200)
        .json(options?.simpleResponses ? result.docs : result);
    }),
  );

  /**
   * 5. COUNT (GET /api/:collection)
   * Maps to: payload.count({ collection, id, depth, ... })
   * NOTE: req is passed to enforce Payload's 'read' access control.
   */
  router.get(
    "/api/:collection/count",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    queryParser,
    asyncHandler(async (req, res) => {
      const { collection } = req.params;
      const { query } = req;
      const result = await payload.count({
        collection,
        depth: query.depth ? parseInt(query.depth) : 0, // Default depth to 0 for performance
        req, // <--- IMPORTANT: Pass req to enforce Payload's access control (e.g., read: authenticated)
        ...query, // Pass all query params (where, sort, etc.)
      });

      return res.status(200).json(result);
    }),
  );

  /**
   * 6. FIND BY ID (GET /api/:collection/:id)
   * Maps to: payload.findByID({ collection, id, depth, ... })
   * NOTE: req is passed to enforce Payload's 'read' access control.
   */
  router.get(
    "/api/:collection/:id",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const { collection, id } = req.params;
      const { query } = req;

      const result = await payload.findByID({
        collection,
        id,
        depth: query.depth ? parseInt(query.depth) : 2, // Default depth to 2 for single lookups
        req, // <--- IMPORTANT: Pass req to enforce Payload's access control (e.g., read: authenticated)
        ...query,
      });

      if (!result) {
        return res
          .status(404)
          .json({ error: `${collection} with ID ${id} not found.` });
      }

      return res.status(200).json(result);
    }),
  );

  /**
   * 7. CREATE (POST /api/:collection)
   * Maps to: payload.create({ collection, data: req.body })
   * Secured: Requires authenticated user (req.user)
   */
  router.post(
    "/api/:collection",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const { collection } = req.params;

      const result = await payload.create({
        collection,
        data: req.body,
      });

      // 201 Created is the standard response for a successful POST operation
      return res.status(201).json(result);
    }),
  );

  /**
   * 8. UPDATE (PATCH /api/:collection/:id)
   * Maps to: payload.update({ collection, id, data: req.body })
   * Secured: Requires authenticated user (req.user)
   */
  router.patch(
    "/api/:collection/:id",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const { collection, id } = req.params;

      const result = await payload.update({
        collection,
        id,
        data: req.body,
      });

      return res.status(200).json(result);
    }),
  );

  /**
   * 9. DELETE (DELETE /api/:collection/:id)
   * Maps to: payload.delete({ collection, id })
   * Secured: Requires authenticated user (req.user)
   */
  router.delete(
    "/api/:collection/:id",
    payloadJwtAuthMiddleware,
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const { collection } = req.params;
      const { id } = req.params;

      const result = await payload.delete({
        collection,
        id,
      });

      // 200 OK with the deleted document
      return res.status(200).json(result);
    }),
  );

  // Error handling middleware (catch-all for errors thrown by async calls)
  router.use((err, req, res, next) => {
    console.error("Payload Router Error:", err);

    // Check for common Payload validation errors
    if (err.name === "ValidationError" || err.data?.errors) {
      return res.status(400).json({
        error: "Validation Failed",
        message: err.message,
        data: err.data,
      });
    }

    // Handle specific Payload auth errors (e.g., login failed)
    if (err.status === 401) {
      return res.status(401).json({
        errors: {
          message: [err.message],
        },
      });
    }

    // Handle not-found errors specifically if Payload doesn't map them correctly
    if (
      err.message.includes("Not Found") ||
      err.message.includes("Cast to ObjectId failed")
    ) {
      return res
        .status(404)
        .json({ error: "Resource Not Found", message: err.message });
    }

    // Generic server error
    return res
      .status(500)
      .json({ error: "Server Error", message: err.message });
  });

  return router;
}

// Export the function to be used as a router in an Express app

/**
 * Example Usage in your Express main file (e.g., server.js):
 *
 * import express from 'express';
 * import payload from 'payload';
 * import payloadAPIRouter from './payload-next-app.js';
 * import path from 'path';
 *
 * const app = express();
 *
 * // Example: Load the Payload configuration file
 * const config = path.resolve(__dirname, './payload/payload.config.js');
 *
 * // 1. Initialize Payload (this step makes 'req.payload' available)
 * async function start() {
 * await payload.init({ secret: 'MY_SECRET', config });
 *
 * // 2. Attach the router under the /api path
 * // This will handle requests like:
 * // POST /api/users/login (Auth)
 * // GET /api/users/me (Auth Status)
 * // GET /api/posts (CRUD)
 * // POST /api/products (CRUD)
 * app.use('/api', payloadAPIRouter());
 *
 * app.listen(4000, () => {
 * console.log('Express API running on port 4000');
 * });
 * }
 * start();
 */
