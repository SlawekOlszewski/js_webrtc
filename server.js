const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");
const { connected } = require("process");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("static")); // Serve static files from current directory
app.use(cors());

app.get("/", (req, res) => {
  res.sendFile(__dirname + static + "/index.html");
});

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("mirror-camera", (room, cameraMirror) => {
    socket.to(room).emit("mirror-camera", cameraMirror, socket.id);
  });

  socket.on("message", (room, message) => {
    console.log("Received message: ", message);
    socket.to(room).emit("message", message, socket.id);
  });

  socket.on("join room", (room) => {
    console.log("User joined room:", room);
    socket.join(room);
  });

  socket.on("offer", (room, offer) => {
    socket.to(room).emit("offer", offer, socket.id);
  });

  socket.on("answer", (room, answer) => {
    socket.to(room).emit("answer", answer, socket.id);
  });

  socket.on("ice-candidate", (room, candidate) => {
    socket.to(room).emit("ice-candidate", candidate, socket.id);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

server.listen(8080, () => {
  console.log("listening on *:8080");
});
