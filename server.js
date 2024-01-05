const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");
const { connected } = require("process");
const { v4: uuidV4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set("view engine", "ejs");
app.use(express.static("public")); // Serve static files from current directory
// app.use(cors());

app.get("/", (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get("/:room", (req, res) => {
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("mirror-camera", (room, cameraMirror) => {
    socket.broadcast.to(room).emit("mirror-camera", cameraMirror, socket.id);
  });

  socket.on("message", (room, message) => {
    console.log("Received message: ", message);
    socket.broadcast.to(room).emit("message", message, socket.id);
  });

  socket.on("join room", (room, userId) => {
    console.log("User ", userId, " joined room:", room);
    socket.join(room);

    socket.on("disconnect", () => {
      console.log("user disconnected");
      socket.broadcast.to(room).emit("user-disconnected", userId);
    });
  });

  socket.on("offer", (room, offer) => {
    socket.broadcast.to(room).emit("offer", offer, socket.id);
  });

  socket.on("answer", (room, answer) => {
    socket.broadcast.to(room).emit("answer", answer, socket.id);
  });

  socket.on("ice-candidate", (room, candidate) => {
    socket.broadcast.to(room).emit("ice-candidate", candidate, socket.id);
  });
});

server.listen(8080, () => {
  console.log("listening on *:8080");
});
