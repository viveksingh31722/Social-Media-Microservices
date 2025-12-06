async function invalidatePostCache(req, input) {

  const cachedKey = `post:${input}`
  await req.redisClient.del(cachedKey);

  const keys = await req.redisClient.keys("posts:*");
  if(keys.length > 0){
    await req.redisClient.del(keys);
  }
}

module.exports = {invalidatePostCache};