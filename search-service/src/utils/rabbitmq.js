const amqp = require("amqplib");
const logger = require("../utils/logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "facebook_events";

async function connectToRabbitMQ(retryCount = 0) {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });

    logger.info("🐇 Connected to RabbitMQ (Search Service)");
    return channel;

  } catch (error) {
    logger.error(
      `❌ RabbitMQ connection failed (attempt ${retryCount + 1}):`,
      error
    );

    if (retryCount >= 10) {
      logger.error("🚫 Max retries reached. Exiting Search Service.");
      process.exit(1);
    }

    // wait 5 seconds then retry
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return connectToRabbitMQ(retryCount + 1);
  }
}

async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  const q = await channel.assertQueue("", { exclusive: true });

  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);

  channel.consume(q.queue, (msg) => {
    if (!msg) return;

    const content = JSON.parse(msg.content.toString());
    callback(content);
    channel.ack(msg);
  });

  logger.info(`📥 Search Service subscribed to event: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, consumeEvent };
