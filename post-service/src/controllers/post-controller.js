const { log } = require("winston");
const logger = require("../utils/logger.js");
const Post = require("../models/Post.js");
const { validateCreatePost } = require("../utils/validation.js");
const { invalidatePostCache } = require("../utils/deleteCachePost.js");
const { publishEvent } = require("../utils/rabbitmq.js");

const createPost = async (req, res) => {
  logger.info("Create post endpoint hit...");
  try {
    // Validate the schema
    const { error } = validateCreatePost(req.body);
    if (error) {
      logger.warn(
        "Validation error in creating post",
        error.details[0].message
      );
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { content, mediaIds } = req.body;
    const newlyCreatedPost = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();


    // this is rabbitmq, publish post created event.
    await publishEvent('post.created', {
      postId: newlyCreatedPost._id.toString(),
      userId: newlyCreatedPost.user.toString(),
      content: newlyCreatedPost.content,
      createdAt: newlyCreatedPost.createdAt,
    })
    await invalidatePostCache(req, newlyCreatedPost._id.toString());
    logger.info("Post created successfully", newlyCreatedPost);
    res
      .status(201)
      .json({ success: true, message: "Post created successfully" });
  } catch (error) {
    logger.error("Error creating post", error);
    res.status(500).json({ success: false, message: "Error creating post" });
  }
};

const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    const cacheKey = `posts:${page}:${limit}`;
    const cachePosts = await req.redisClient.get(cacheKey);

    if (cachePosts) {
      return res.json(JSON.parse(cachePosts));
    }

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const totalNoOfPosts = await Post.countDocuments();
    const result = {
      posts,
      currentPage: page,
      totalPages: Math.ceil(totalNoOfPosts / limit),
      totalPosts: totalNoOfPosts,
    };

    // save your posts in redis cache
    await req.redisClient.setex(cacheKey, 300, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    logger.error("Error fetching posts", error);
    res.status(500).json({ success: false, message: "Error fetching posts" });
  }
};

const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const cacheKey = `post${postId}`;

    const cachePost = await req.redisClient.get(cacheKey);

    if (cachePost) {
      return res.json(JSON.parse(cachePost));
    }

    const singlePostDetailsById = await Post.findById(postId);
    if (!singlePostDetailsById) {
      return res.json({
        message: "Post not found",
        success: false,
      });
    }

    await req.redisClient.setex(
      cacheKey,
      3600,
      JSON.stringify(singlePostDetailsById)
    );

    res.json(singlePostDetailsById);
  } catch (error) {
    logger.error("Error fetching post by ID", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching post by ID" });
  }
};

const deletePost = async (req, res) => {
  try {
    //Using this way we can delete the post just getting the id.
    // const postId = req.params.id;
    // const delPostById = await Post.findByIdAndDelete(postId);

    //Using this way we can find the user and then only delete the post associated to that user.

    const post = await Post.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId
    })

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
        success: false,
      });
    }

    //Publish post delete method
    await publishEvent('post.deleted', {
      postId: post._id.toString(),
      userId: req.user.userId,
      mediaIds: post.mediaIds
    })

    await invalidatePostCache(req, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting post", error);
    res.status(500).json({ success: false, message: "Error deleting post" });
  }
};

module.exports = { createPost, getAllPosts, getPost, deletePost };
