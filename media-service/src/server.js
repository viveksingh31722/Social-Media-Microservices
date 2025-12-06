require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const mediaRoutes = require("./routes/media-routes");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ } = require('./utils/rabbitmq');
const { handlePostDeleted } = require("./eventHandlers/media-event-handlers");
const { consumeEvent } = require('./utils/rabbitmq')

const app = express();
const PORT = process.env.PORT || 3003;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("✅ Connected to MongoDB"))
  .catch((e) => logger.error("❌ MongoDB connection error", e));


app.use(cors());
app.use(helmet());
app.use(express.json());

// Log each request
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

app.use('/api/media', mediaRoutes);
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    //consume all the events
    await consumeEvent('post.deleted', handlePostDeleted); 

    app.listen(PORT, () => {
      logger.info(`🚀 Media Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to server', error);
    process.exit();
  }
}

startServer();

// app.listen(PORT, () => {
//   logger.info(`🚀 Identity Service running on port ${PORT}`);
// });

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "Reason:", reason);
});
