const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const app = express();
app.use(express.json())

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const getFollowinfPeopleIdsOfUser = async (username) => {
    const getFollowingPopleQuery = `
    SELECT follower_user_id FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';`;
    const followingPeople = await db.all(getFollowingPopleQuery)
    const arrayOfIds = followingPeople.map((eachUser)=> eachUser.following_user_id);
    return arrayOfIds;
};

const authentication = (request, response, next) => {
  let jwtToken 
   const authHeader = request.header["authorization"]
   if (authHeader) {
    jwtToken = authHeader.split(" ")[1]
    console.log(jwtToken)
    }
   if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, playload)=>{
      console.log(playload)
      if (error) {
        response.status(401)
        response.send("Invalid jwt Token")
      }else{
        request.username = playload.username
        request.userId = playload.userId;
        next()
      }
    });  
   }else {
    response.status(401)
    response.send("Invalid jwt Token");
   }
};

const tweetAccessVerification = async (request, response, next)=>{
  const {userId} = request;
  const {tweetId} = request.params;
  const getTweetQuery = `
  SELECT * FROM tweet INNER JOIN tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
  WHERE tweet.tweet_id = '${tweetId}' AND follower.follower_user_id = '${userId}'`;
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined){
    response.status(401)
    response.send("Invalid Request")
  }else{
    next();
  }
};


app.post("/register/", async (request, response)=>{
  const {username, password, name, gender} = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const userDBDetails = await db.get(getUserQuery);
  if (userDBDetails!==undefined){
    response.status(400);
    response.send("User already exists")
  }else{
    if (password.length <6) {
      response.status(400);
      response.send("Password is too short")
    }else{
      const hashedPassword = await bcrypt.hash(password, 10);
      const cresteUserQuery = `INSERT INTO user(username, password, name, gender)
      VALUES('${username}', '${hashedPassword}', '${name}', '${gender}')`;
      await db.run(cresteUserQuery);
      response.send("User created successfully")
    }
  }
});

app.post("/login/", async (request, response)=>{
  console.log("loged")
  const {username, password} = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const userDBDetails = await db.get(getUserQuery)
  if (userDBDetails!== undefined){
    const isPasswordCorrect = await bcrypt.compare(password, userDBDetails.password)
    if (isPasswordCorrect){
      const payload = {username, userId: userDBDetails.user_id};
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      console.log(jwtToken)
      response.send({jwtToken})
    }else{
      response.status(400);
      response.send("Invalid password")
    }
  }else{
    response.status(400)
    response.send("Invalid user")
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response)=>{
  const {username} = request;
  const followingPopleIds = await getFollowinfPeopleIdsOfUser(username);
  const getTweetsQuery = `
  SELECT username, tweet, data_time as datetime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN ('${followingPopleIds}')
  ORDER BY date_time DESC 
  LIMIT 4`;
  const tweets = await db.all(getTweetsQuery)
  console.log(tweets)
  response.send(tweets)
});

app.get("/user/following/", authentication, async (request, response)=>{
  const {username, userId} = request;
  const getFollowingUsersQuery = `
  SELECT name
  FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE user.follower_user_id = '${userId}'`;
  const followingPeope = await db.all(getFollowingUsersQuery)
  response.send(followingPeope)
});

app.get("/user/followers/", authentication, async (request, response)=>{
  const {username, userId} = request;
  const getFollowersQuery = `
  SELECT DISTINCT name
  FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
  WHERE user.following_user_id = '${userId}'`;
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
});

app.get("/tweets/:tweetId/" , authentication, tweetAccessVerification, async (request, response)=>{
  const {username, userId} = request;
  const {tweetId} = request.params;
  const getResultsQuery = `SELECT tweet , 
  (SELECT count() from like where tweet_id = '${tweetId}') AS likes,
  (SELECT count() from replay where tweet_id=${tewwtId}) AS replies,
  date_time As dateTime 
  FROM tweet WHERE tweet, tweet_id = '${tweetId}'`;
  const tweet = await db.get(getResultsQuery)
  response.send(tweet)
})

app.get("/tweets/:tweetId/likes/" , authentication, tweetAccessVerification, async (request, response)=>{
  const {tweetId} = request.params;
  const getResultsQuery = `SELECT username 
  FROM user INNER JOIN like ON user.user_id = like.user_id WHERE  tweet_id = '${tweetId}'`;
  const likedUsers = await db.all(getResultsQuery)
  const userArray = likedUsers.map((eachItem)=>eachItem.username)
  response.send({likes :userArray})
});

app.get("/tweets/:tweetId/replies/" , authentication, tweetAccessVerification, async (request, response)=>{
  const {tweetId} = request.params;
  const getResultsQuery = `SELECT name, replay 
  FROM user INNER JOIN reply ON user.user_id = reply.user_id WHERE  tweet_id = '${tweetId}'`;
  const repliedUsers = await db.all(getResultsQuery)
  response.send({replies :repliedUsers})
});

app.get("/users/tweets/", authentication, async (request, response)=>{
  const {userId} = request;
  const getTweetsQuery = `
  SELECT tweet,
  Count(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id)AS replies,
  date_time AS dateTime,
  FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
  WHERE tweet.user_id = '${userId}'
  GROUP BY tweet.tweet_id`

  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
});

app.post("/users/tweets/", authentication, async(request, response)=>{
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date.toJSON().substring(0,19).replace("T", " ")
  const createTweetQuery = `
  INSERT INTO tweet(tweet, user_id, date_time)
  VALUES('${tweet}', '${userId}', '${dateTime}')`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet")
});

app.delete("/tweets/:tweetId/" , authentication, async (request, response)=>{
  const {userId} = request;
  const {tweetId} = request.params;
  const getResultsQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}'`;
  const tweet = await db.get(getResultsQuery)
  if (tweet ===undefined){
    response.status(401)
    response.send("Invalid Request")
  }else{
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}'`;
    await db.run(deleteTweetQuery)
    response.send("Tweet Removed");
  }
})

module.exports = app