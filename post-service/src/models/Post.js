const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    mediaIds: [
      {
        type: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

//In the case you have not created a search service as separate microservice, you can create a text index on the content field to enable text search functionality.
postSchema.index({ content: "text" });

const Post = mongoose.model("Post", postSchema);

module.exports = Post;


