require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");
const postRoutes = require("./routes/post-routes");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ } = require("./utils/rabbitmq");
const { consumeEvent } = require("../../media-service/src/utils/rabbitmq");
// const rateLimit = require('express-rate-limit')

const app = express();
const PORT = process.env.PORT || 3002;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("✅ Connected to MongoDB"))
  .catch((e) => logger.error("❌ MongoDB connection error", e));

// Redis client
const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Log each request
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

// const sensitiveEndpointsLimiter = rateLimit({
//    windowMs: 15 * 60 * 1000, // 15 minutes
//   limit: 50, // Max 50 requests per window per IP
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: (req, res) => {
//     logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
//     res.status(429).json({ success: false, message: "Too many requests" });
//   },
// })

// *** here i need to add the rate limiter for different controllers/routes eg: for createPost, getAllPosts, deletePost etc ***

// Routes --> pass redisClient to routes
app.use(
  "/api/posts",
  (req, res, next) => {
    req.redisClient = redisClient;
    next();
  },
  postRoutes
);

app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ(); 

    app.listen(PORT, () => {
      logger.info(`🚀 post Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to server', error);
    process.exit();
  }
}

startServer();

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "Reason:", reason);
});
