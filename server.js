// Required modules
const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const port = 3000;
const uri = 'mongodb://localhost:27017/messagingApp';
const JWT_SECRET = 'your_jwt_secret';

app.use(cors());
app.use(bodyParser.json());

const client = new MongoClient(uri);

async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error(err);
  }
}

connectDB();

// WebSocket Server Setup
const server = app.listen(port, () => {
  console.log(`HTTP server running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });


const userSockets = {}; // To keep track of connected users and their WebSocket instances


wss.on('connection', (ws) => {
  console.log('Client connected');

  // Store the user ID associated with this WebSocket connection
  let currentUserId;

  // Register the user when they connect
  ws.on('message', (message) => {
    const msgObject = JSON.parse(message);
    console.log("websocket", msgObject);

    // Check if it's a registration message
    if (msgObject.type === 'register') {
      const token = msgObject.token;

      // Verify the JWT token to get the user ID
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.id; // Assuming your token has a property 'id'

        // Map user ID to WebSocket
        userSockets[currentUserId] = ws; 
        console.log(`User ID ${currentUserId} registered for WebSocket communication`);
      } catch (err) {
        console.error('Token verification failed:', err);
        ws.close(); // Optionally close the WebSocket connection if verification fails
      }
    } else {
      // Handle regular message sending
      const { receiverId } = msgObject; // Extract receiver ID from the message

      // Send the message to the specified receiver
      const receiverSocket = userSockets[receiverId];

      if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
        receiverSocket.send(JSON.stringify({
          senderId: currentUserId, // Use the stored currentUserId here
          message: msgObject.message
        }));
      } else {
        console.log(`Receiver with ID ${receiverId} is not connected`);
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    
    // Remove the user from userSockets here
    if (currentUserId) {
      delete userSockets[currentUserId];
      console.log(`User ID ${currentUserId} disconnected and removed from mapping`);
    }
  });
});









// User Registration Endpoint
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // Check if user already exists
  const usersCollection = client.db().collection('users');
  const existingUser = await usersCollection.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create a new user
  const newUser = {
    username,
    passwordHash: hashedPassword,
    createdAt: new Date(),
    lastLogin: new Date(),
  };

  await usersCollection.insertOne(newUser);
  res.status(201).json({ message: 'User created' });
});

// User Login Endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const usersCollection = client.db().collection('users');

  const user = await usersCollection.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Create JWT token
  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});


app.get('/users', async (req, res) => {
  try {
    const usersCollection = client.db().collection('users');
    const users = await usersCollection.find({}, { projection: { passwordHash: 0 } }).toArray(); // Exclude passwordHash
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Send Message Endpoint
app.post('/messages', async (req, res) => {
  const { token, message, receiverId } = req.body; // Now expect receiverId from the request body

  console.log('Received message:', message); // Debug statement
  console.log('Received token:', token); // Debug statement

  // Verify the JWT token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const senderId = decoded.id; // Get the sender ID from the token

    console.log('Sender ID:', senderId); // Debug statement
    console.log('Receiver ID:', receiverId); // Debug statement

    // Create a new message object
    const newMessage = {
      senderId,
      receiverId,
      message,
      createdAt: new Date(),
    };

    console.log('New message object:', newMessage); // Debug statement

    // Save the message to the database
    const messagesCollection = client.db().collection('messages');
    await messagesCollection.insertOne(newMessage);
    res.status(201).json({ message: 'Message sent', data: newMessage });
  } catch (err) {
    console.error('Error verifying token or saving message:', err); // Debug statement
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Fetch Messages Endpoint
app.get('/messages', async (req, res) => {
  try {
    const messagesCollection = client.db().collection('messages');
    const messages = await messagesCollection.find().toArray();
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Start the server
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });



