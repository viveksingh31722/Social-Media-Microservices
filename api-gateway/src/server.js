require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const logger = require("./utils/logger");
const proxy = require("express-http-proxy");
const { error, log, Logger } = require("winston");
const errorHandler = require("./middleware/errorHandler");
const { validateToken } = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(cors());
app.use(express.json());

//rate limiting
const ratelimitOptions = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // Max 50 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ success: false, message: "Too many requests" });
  },
  // store: RedisStore({
  //   sendCommand: (...args) => redisClient.sendCommand(...args),
  // }),
});

app.use(ratelimitOptions);
// Log each request
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

// api-gateway -> /v1/auth/register -> 3000
// identity-service -> /api/auth/register -> 3001
// localhost:3000/v1/auth/register -> localhost:3001/api/auth/register

const proxyOptions = {
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },
  proxyErrorHandler: (err, res, next) => {
    logger.error(`Proxy error: ${err.message}`);
    res.status(500).json({
      message: `Internal Server error`,
      error: err.message,
    });
  },
};

//Setting up proxies for our identity service
app.use(
  "/v1/auth",
  proxy(process.env.IDENTITY_SERVICE_URL, {
    ...proxyOptions,

    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["content-type"] = "application/json";
      proxyReqOpts.headers["x-forwarded-for"] = srcReq.ip;

      if (srcReq.headers["authorization"]) {
        proxyReqOpts.headers["authorization"] = srcReq.headers["authorization"];
      }

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response from identity service: HTTP ${proxyRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`
      );
      return proxyResData;
    },
  })
);

//Setting up proxies for our post service
app.use(
  "/v1/posts",
  validateToken,
  proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["content-type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response from post service: HTTP ${proxyRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`
      );
      return proxyResData;
    },
  })
);

//Setting up proxies for our media service
app.use(
  "/v1/media",
  validateToken,
  proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,

    // Modify outgoing request before sending to Media Service
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // Pass user ID to Media Service
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      // Read content-type safely (always lowercase in Node)
      const contentType = srcReq.headers["content-type"] || "";

      // Only override content-type for non-multipart requests
      if (!contentType.includes("multipart/form-data")) {
        proxyReqOpts.headers["content-type"] = "application/json";
      }

      return proxyReqOpts;
    },

    // Log Media Service's response
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response from media service: HTTP ${proxyRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`
      );
      return proxyResData; // Return raw data
    },

    // Required so file uploads pass through untouched
    parseReqBody: false,
  })
);

//Setting up proxies for our search service
app.use(
  "/v1/search",
  validateToken,
  proxy(process.env.SEARCH_SERVICE_URL, {
    ...proxyOptions,

    // Modify outgoing request before sending to Media Service
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // Pass user ID to Media Service
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      // Read content-type safely (always lowercase in Node)
      const contentType = srcReq.headers["content-type"] || "";

      // Only override content-type for non-multipart requests
      if (!contentType.includes("multipart/form-data")) {
        proxyReqOpts.headers["content-type"] = "application/json";
      }

      return proxyReqOpts;
    },

    // Log Media Service's response
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response from search service: HTTP ${proxyRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`
      );
      return proxyResData; // Return raw data
    },

    // Required so file uploads pass through untouched
    parseReqBody: false,
  })
);

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Api gateway running on port: ${PORT}`);
  logger.info(
    `Identity service is running on port ${process.env.IDENTITY_SERVICE_URL}`
  );
  logger.info(
    `Post service is running on port ${process.env.POST_SERVICE_URL}`
  );
  logger.info(
    `Media service is running on port ${process.env.MEDIA_SERVICE_URL}`
  );
  logger.info(
    `Search service is running on port ${process.env.SEARCH_SERVICE_URL}`
  );
  logger.info(`Redis Url ${process.env.REDIS_URL}`);
});
